'use strict';

var config = require('../lib/config');
var CrowdPulse = require('../crowd-pulse-data');
var databaseName = require('../crowd-pulse-data/databaseName');

var twitter = require('../endpoint/twitter');
var facebook = require('../endpoint/facebook');
var linkedIn = require('../endpoint/linkedin');

const DELAY = 5000;

/**
 * Update all user social information.
 * @param profiles: update profiles if true
 * @param messages: update messages if true
 * @param likes: update likes if true
 */
exports.updateUserSocialInformation = function (profiles, messages, likes) {
  var dbConnection = new CrowdPulse();
  dbConnection.connect(config.database.url, databaseName.profiles).then(function (conn) {
    return conn.Profile.find(function (err, profiles) {
      dbConnection.disconnect();

      if (profiles && profiles.length > 0) {
        profiles.forEach(function (profile) {

          setTimeout(function () {
            if (profile.identities.configs.twitterConfig.twitterId) {
              if (profiles) {
                twitter.updateUserProfile(profile.username, null);
              }
              if (messages) {
                twitter.updateTweets(profile.username);
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
            }
            if (profile.identities.configs.linkedInConfig.linkedInId) {
              if (profiles) {
                linkedIn.updateUserProfile(profile.username, null);
              }
            }
          }, DELAY);

        });
      }
    });
  });
};

/**
 * Execute standard CrowdPulse Project.
 */
exports.executeCrowdPulseStandardPipeline = function () {
  var projectId = config['crowd-pulse'].standardPipeline;
  if (!projectId || projectId === '') {
    console.log("No standard CrowdPulse pipeline set");
  } else {
    return crowdPulse.Project.getById(projectId)
      .then(function(project) {
        return project.createNewRun(config.logs.path);
      })
      .spread(function(project, run) {
        return [project, run];
      })
      // launch the run
      .spread(cpLauncher.executeProjectRun)
  }
};