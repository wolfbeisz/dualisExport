// GLOBAL VARIABLES
var webpage = require('webpage');
var system = require('system');

var baseUrl = 'http://dualis.dhbw.de';
var WAIT_TIME = 2000;

// BROWSER JS
var loginEvaluateable = function (username, password) {
  document.querySelector('#field_user').value = username;
  document.querySelector('#field_pass').value = password;
  document.querySelector('#logIn_btn').click();
};

var findUrlForLanguageSwitchingEvaluatable = function () {
  var link = document.querySelector('#pageHeadSwitchLang > a');
  return link.getAttribute('href');
};

var exportSemesterEvaluatable = function() {
  var rows = document.querySelectorAll('table[class="nb list"] > tbody > tr');
  var results = [];
  for (var i = 0; i < Math.max(0, rows.length - 1); i++) {
    var row = rows[i];
    var result = {};
    var cells = row.getElementsByTagName('td');
    result['number'] = cells[0].textContent;
    result['unitName'] = cells[1].textContent;
    result['finalGrade'] = cells[2].textContent.trim();
    result['credits'] = cells[3].textContent.trim();
    result['malusPoints'] = cells[4].textContent;
    result['status'] = cells[5].textContent.trim();
    var regex = /dl_popUp\("([^"]+)"/;
    var match = regex.exec(cells[6].getElementsByTagName('script')[0].textContent);
    if (match != null) {
      result['detailPage'] = match[1];
    }

    results.push(result);
  }
  return results;
};

var exportDetailsEvaluatable = function() {
  var rows = document.querySelectorAll('table[class="tb"]:first-of-type > tbody > tr');
  
  // details = {"versuch1":{}, "versuch2":[{"examinationName":"T2_3000.1 Projektarbeit 3 (MA-TINF12AIBI)", "parts": [{}, {"semester":"SoSe 15", "name":"Projektarbeit (100%)", "grade":"1,0"}]}]}
  var details = [];
  var currentTry = null;
  var currentExamination = null;
  for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    if (rowIndex != 0 && rowIndex != 1 && rowIndex != rows.length - 1) {
      var row = rows[rowIndex];
      var cells = row.getElementsByTagName('td');
      
      if (cells != null && cells.length > 0) {
        var firstCell = cells[0];
        if (firstCell.getAttribute('class') != null && 
            firstCell.getAttribute('class').indexOf('level01') != -1) {
          currentTry = {};
          currentTry['attempt'] = firstCell.textContent.trim();
          currentTry['examinations'] = [];
          details.push(currentTry);
        } else if (firstCell.getAttribute('class') != null && 
                   firstCell.getAttribute('class').indexOf('level02') != -1) {
          currentExamination = {};
          currentExamination['unit'] = firstCell.textContent.trim();
          currentExamination['parts'] = [];
          currentTry['examinations'].push(currentExamination);
        } else if (firstCell.getAttribute('class') != null && 
                   firstCell.getAttribute('class').indexOf('tbdata') != -1) {
          var part = {};
          part['semester'] = firstCell.textContent.trim();
          part['name'] = cells[1].textContent.trim();
          part['grade'] = cells[3].textContent.trim();
          currentExamination['parts'].push(part);
        }
      }
    } 
  }
  return details;
};

// CONTROL FLOW JS

var navigateTo = function (webpage, destination, callback) {
  webpage.open(destination, function (status) {
    callback(status === 'success');
  }); 
};

var getAnchorReferenceByCssSelector = function (webpage, selectorText) {
  return webpage.evaluate(function(selector) {
    return document.querySelector(selector).getAttribute('href');
  }, selectorText);
};

var navigateToCourseResults = function (webpage, callback) {
  var path = getAnchorReferenceByCssSelector(webpage, 'a[class="depth_1 link000307 navLink"]');
  var url = baseUrl + path;
  navigateTo(webpage, url, callback);
  //TODO: wait for page to load?
};

var login = function (webpage, username, password, callback) {
  //webpage.render('beforeLogin.png');
  webpage.evaluate(loginEvaluateable, username, password);
  setTimeout(function() {
    //webpage.render('afterLogin.png');
    callback();
  }, WAIT_TIME);
};

var switchLanguage = function (webpage, callback) {
  var relativePath = webpage.evaluate(findUrlForLanguageSwitchingEvaluatable);
  navigateTo(webpage, baseUrl + relativePath, function (navigationSuccess) {
    if (!navigationSuccess) { console.log('navigation failed');}
    setTimeout(function () {
      callback();
    }, WAIT_TIME);
  });
};

var detectLanguage = function (webpage) {
  return webpage.evaluate(function(){
    return document.documentElement.getAttribute('lang');
  });
};

var switchToGermanVersion = function (webpage, callback) {
  if (detectLanguage(webpage) !== 'de') {
    switchLanguage(webpage, function() {
      //webpage.render('afterLanguageSwitch.png');
      callback();
    });
  } else {
    callback();
  }
};

var findSemester = function (webpage) {
  var array =  webpage.evaluate(function () {
    var options = document.querySelectorAll('#semester > option');
    console.log('options: ' + options); 
    var semesterIds = [];
    for (var i = 0; i < options.length; i++) {
      var value = options[i].getAttribute('value');
      if (value != null) {
        semesterIds.push(value);
      }
    }
    return semesterIds;
  });
  
  //copy as the behaviour of 'array' is strange
  var semesterIds = [];
  for (var i = 0; i < array.length; i++){
    semesterIds.push(array[i]);
  }
  return semesterIds;
    
};

var switchToSemester = function (webpage, optionValue, callback) {
  webpage.evaluate(function (value) {
    var js = document.getElementById('semester').getAttribute('onChange');
    js = js.replace(/this\.value/, "'"+value+"'");
    eval(js);
    /*var options = document.querySelectorAll('#semester > option');
    for (var index=0; index < options.length; index++) {
      if (options[index].getAttribute('value') === value) {
        document.getElementById('semester').selectedIndex = index;
        $('#semester').change();
      }
    }*/
    //TODO: does it work?
  }, optionValue);
  setTimeout(callback, 2 * WAIT_TIME);
};

var exportSemester = function(webpage, semesterIds, data, callback) {
  if (semesterIds.length == 0) {
    callback(data);
  }
  else {
    var semester = semesterIds[semesterIds.length - 1];
    semesterIds.length = semesterIds.length - 1;

    // switch to semester
    switchToSemester(webpage, semester, function () {
      //webpage.render('afterOptionClick'+(new Date()).getTime()+'.png');
      // export semester
    
      data[semester] = webpage.evaluate(exportSemesterEvaluatable);
      
      exportSemester(webpage, semesterIds, data, callback);
    });
  }
};

var exportDetailPages = function (webpage, courseResults, details, callback) {
  if (courseResults.length === 0) {
    callback(details);
  } else {
    var currentResult = courseResults.pop();
    var resultDetailsURL = baseUrl + currentResult['detailPage'];
    navigateTo(webpage, resultDetailsURL, function () {
      setTimeout(function () {
        var detail = page.evaluate(exportDetailsEvaluatable);
        details[currentResult['detailPage']] = detail;
                                                   
        //recursion
        exportDetailPages(webpage, courseResults, details, callback);
      }, WAIT_TIME);
    });
    

  }
};

var exportDetails = function (webpage, data, callback) {
  var courseResults = [];
  for (var semester in data) {
    var coursesInSemester = data[semester];
    courseResults = courseResults.concat(coursesInSemester);
  }

  exportDetailPages(webpage, courseResults, {}, function (details) {
    // add detail information to data (we have to copy data first as it is an object created in the browser's js context)
    var dataCopy = {};
    for (var semesterName in data) {
      dataCopy[semesterName] = [];
      var courseResults = data[semesterName];
      for (var i = 0; i < courseResults.length; i++) {
        var courseResult = courseResults[i];
        var courseResultWithDetails = {};
        for (var property in courseResult) {
          if (property === 'detailPage') {
            //map to details-object with url
            courseResultWithDetails['details'] = details[courseResult['detailPage']];
          } else {
            courseResultWithDetails[property] = courseResult[property];
          }
        }
        dataCopy[semesterName].push(courseResultWithDetails);
      }
    }
    
    callback(dataCopy);
  });

  
};

var exportGrades = function (webpage, username, password, callback) {
  navigateTo(webpage, baseUrl + '/scripts/mgrqcgi?APPNAME=CampusNet&PRGNAME=EXTERNALPAGES&ARGUMENTS=-N000000000000001,-N000324,-Awelcome', function (success) {
    login(webpage, username, password, function () {
      switchToGermanVersion(webpage, function() {
        navigateToCourseResults(webpage, function() {
          //webpage.render('courseResultsPage.png');
          
          // get semesters
          var semesterIds = findSemester(webpage);

          exportSemester(webpage, semesterIds, {}, function(data) {
            exportDetails(webpage, data, callback);
          });
        });
      });
    });
  });
};





// PROGRAM

if (system.args.length !== 3) {
  console.log('usage: gradeExport.js <username> <password>');
  phantom.exit();
}

var user = system.args[1];
var pass = system.args[2];

var page = webpage.create();
//page.onResourceRequested = function(request){};
//page.onResourceReceived = function(response){};
page.onConsoleMessage = function(message) {/*console.log('browser: ' + message);*/};
page.onError = function(message, stacktrace) {};

exportGrades(page, user, pass, function(data) {
  console.log(JSON.stringify(data));
  phantom.exit();
});