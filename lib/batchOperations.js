'use strict';

var config = require('../lib/config');
var CrowdPulse = require('../crowd-pulse-data');
var databaseName = require('../crowd-pulse-data/databaseName');
var cpLauncher = require('../lib/cpLauncher');

var twitter = require('../endpoint/twitter');
var facebook = require('../endpoint/facebook');
var linkedIn = require('../endpoint/linkedin');

const DELAY = 5000;

/**
 * Update all user social information.
 * @param profiles: update profiles if true
 * @param messages: update messages if true
 * @param likes: update likes if true
 * @param friends: update friends if true
 */
exports.updateUserSocialInformation = function (profiles, messages, likes, friends) {
  var dbConnection = new CrowdPulse();
  dbConnection.connect(config.database.url, databaseName.profiles).then(function (conn) {
    return conn.Profile.find(function (err, profiles) {
      dbConnection.disconnect();

      if (profiles && profiles.length > 0) {
        (function loopWithDelay (i) {
          setTimeout(function () {
            var profile = profiles[i];

            if (profile.identities.configs.twitterConfig.twitterId) {
              if (profiles) {
                twitter.updateUserProfile(profile.username, null);
              }
              if (messages) {
                twitter.updateTweets(profile.username);
              }
              if (friends) {
                twitter.updateFriends(profile.username);
              }
            }
            if (profile.identities.configs.facebookConfig.facebookId) {
              if (profiles) {
                facebook.updateUserProfile(profile.username, null);
              }
              if (messages) {
                facebook.updatePosts(profile.username);
              }
              if (likes) {
                facebook.updateLikes(profile.username);
              }
              if (friends) {
                facebook.updateFriends(profile.username);
              }
            }
            if (profile.identities.configs.linkedInConfig.linkedInId) {
              if (profiles) {
                linkedIn.updateUserProfile(profile.username, null);
              }
            }

            if (i--) {
              loopWithDelay(i);
            }
          }, DELAY);
        })(profiles.length - 1);
      }
    });
  });
};

/**
 * Execute CrowdPulse projects set in configuration file.
 */
exports.executeCrowdPulseProjects = function () {

  // reading the CrowdPulse project name to execute from configuration file
  var projectsName = config['crowd-pulse'].projects;

  if (!projectsName || projectsName.length === 0) {
    console.log("No CrowdPulse projects set");
  } else {
    var dbConnection = new CrowdPulse();
    dbConnection.connect(config.database.url, databaseName.profiles).then(function (conn) {

      // get all user profiles
      return conn.Profile.find(function (err, profiles) {
        dbConnection.disconnect();

        if (profiles && profiles.length > 0) {

          // for each profile execute the CrowdPulse project, setting a delay
          (function loopProfiles (i) {
            var profile = profiles[i];
            (function loopProjectsWithDelay (j) {
              setTimeout(function () {
                var project = projectsName[j];

                // run CrowdPulse
                runCrowdPulse(project, profile.username);

                // stop conditions
                if (j--) {

                  // if j != 0 loop projects
                  loopProjectsWithDelay(j);

                } else if (i--) {

                  // if i != 0 loop profiles
                  loopProfiles(i);
                }
              }, DELAY);
            })(projectsName.length - 1);
          })(profiles.length - 1);

        }

      });
    });
  }

};


var runCrowdPulse = function (projectName, username) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, config.database.db).then(function (conn) {
    return conn.Project.findOne({name: projectName})
      .then(function (project) {
        return project.createNewRun(config.logs.path);
      })
      .spread(function (project, run) {
        console.log(projectName + " is running for " + username + " at " + new Date());
        project.config = project.config.replace(/{{dbName}}/g, username);

        return [project, run];
      })
      // launch the run
      .spread(cpLauncher.executeProjectRun)

  }).then(function () {
    dbConnection.disconnect();
  });
};

// export function to use in other module
exports.runCrowdPulse = runCrowdPulse;