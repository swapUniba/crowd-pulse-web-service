'use strict';

var router = require('express').Router();
var request = require('request');
var qs = require('querystring');
var CrowdPulse = require('./../crowd-pulse-data');
var config = require('./../lib/config');
var databaseName = require('./../crowd-pulse-data/databaseName');
var LinkedInProfileSchema = require('./../crowd-pulse-data/schema/linkedinProfile');
var batch = require('./../lib/batchOperations');

const CLIENT_ID = '77kw2whm8zdmzr';
const CLIENT_SECRET = 'IgFP60GaF2Sa8jzD';
const PERMISSION = ['r_basicprofile', 'r_emailaddress', 'rw_company_admin', 'w_share'];

const API_LOGIN_DIALOG = 'https://www.linkedin.com/oauth/v2/authorization';
const API_ACCESS_TOKEN =  'https://www.linkedin.com/oauth/v2/accessToken';
const API_PEOPLE = 'https://api.linkedin.com/v1/people/~:(id,first-name,last-name,headline,email-address,picture-url,location,' +
  'industry,num-connections,summary,specialties,positions,associations,interests,patents,skills,certifications,' +
  'educations,courses,volunteer,num-recommenders,following,date-of-birth,honors-awards)';


exports.endpoint = function() {

  /**
   * Creates a login dialog URL.
   * Params:
   *    callbackUrl - the url send to LinkedIn as callback
   */
  router.route('/linkedin/login_dialog')
    .post(function (req, res) {
      try {
        var params = {
          response_type: 'code',
          client_id: CLIENT_ID,
          redirect_uri: req.body.callbackUrl,
          state: 'state',
          scope: PERMISSION.join(',')
        };

        var loginDialogUrl = API_LOGIN_DIALOG + '?' + qs.stringify(params);
        res.status(200);
        res.json({
          loginDialogUrl: loginDialogUrl
        });
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });


  /**
   * Exchange authorization code for access token.
   * Params:
   *    code - the authorization code returned by LinkedIn after user login
   *    callbackUrl - the url send to LinkedIn as callback
   */
  router.route('/linkedin/request_token')
    .post(function (req, res) {
      try {
        var params = {
          code: req.body.code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: req.body.callbackUrl,
          grant_type: 'authorization_code'
        };

        request.post(API_ACCESS_TOKEN, { form: params, json: true }, function(err, response, body) {
          if (response.statusCode !== 200) {
            res.sendStatus(500);
          } else {

            // save oauthData in the database
            var dbConnection = new CrowdPulse();
            return dbConnection.connect(config.database.url, databaseName.profiles).then(function (conn) {
              return conn.Profile.findOne({username: req.session.username}, function (err, profile) {
                if (profile) {
                  profile.identities.configs.linkedInConfig = {
                    accessToken: body.access_token,
                    expiresIn: body.expires_in
                  };
                  profile.save();
                }
                res.status(200);
                res.json({auth: true});
              });
            }).then(function () {
              dbConnection.disconnect();
            });
          }
        });

      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });


  /**
   * Get LinkedIn user profile information.
   */
  router.route('/linkedin/profile')
    .get(function (req, res) {
      try {
        updateUserProfile(req.session.username, function (profile) {
          res.status(200);
          res.json({auth: true, user: profile});
        });
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }

    });

  /**
   * Update LinkedIn configuration reading parameters from query.
   */
  router.route('/linkedin/config')
    .get(function (req, res) {
      try {
        var params = req.query;
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, databaseName.profiles).then(function (conn) {
          return conn.Profile.findOne({username: req.session.username}, function (err, user) {
            if (user) {

              // update share option
              if (params.shareProfile !== null && params.shareProfile !== undefined) {
                user.identities.configs.linkedInConfig.shareProfile = params.shareProfile;
              }
              user.save();

              res.status(200);
              res.json({auth: true});

            } else {
              res.sendStatus(404);
            }
          });
        }).then(function () {
          dbConnection.disconnect();
        });

      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });

  /**
   * Delete LinkedIn information account.
   */
  router.route('/linkedin/delete')
    .delete(function (req, res) {
      try {
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, databaseName.profiles).then(function (conn) {
          return conn.Profile.findOne({username: req.session.username}, function (err, profile) {
            if (profile) {
              profile.identities.linkedIn = undefined;
              profile.identities.configs.linkedInConfig = undefined;
              profile.save();

              res.status(200);
              res.json({auth: true});
            }
          });
        }).then(function () {
          dbConnection.disconnect();
        });

      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });


  return router;
};

/**
 * Update the user profile information.
 * @param username
 * @param callback
 */
var updateUserProfile = function (username, callback) {

  // default empty callback
  if (!callback) {
    callback = function () {}
  }

  // api parameters
  var params = {
    oauth2_access_token: null,
    format: 'json'
  };

  // get access token data from database
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName.profiles).then(function (conn) {
    return conn.Profile.findOne({username: username});
  }).then(function (profile) {
    if (profile) {
      params.oauth2_access_token = profile.identities.configs.linkedInConfig.accessToken;

      // true if it is the first time user requests linkedIn profile
      var firstRequest = !profile.identities.configs.linkedInConfig.linkedInId;

      request.get({url: API_PEOPLE, qs: params, json: true}, function (err, response, userData) {
        if (err) {
          return err;
        }

        if (firstRequest) {
          
          // share default value
          profile.identities.configs.linkedInConfig.shareProfile = true;
        }

        // save the LinkedIn user ID
        if (userData.id) {
          profile.identities.linkedIn.linkedInId = userData.id;
          profile.identities.configs.linkedInConfig.linkedInId = userData.id;
        }

        // save other returned data
        for (var key in LinkedInProfileSchema) {
          if (LinkedInProfileSchema.hasOwnProperty(key) && userData[key]) {
            profile.identities.linkedIn[key] = userData[key];
          }
        }

        // save location
        if (userData.location) {
          profile.identities.linkedIn.location = userData.location.name;
        }

        // change profile picture
        if (userData.pictureUrl) {
          profile.pictureUrl = profile.identities.linkedIn.pictureUrl;
        }

        // save profile in the DB
        profile.save().then(function () {
          console.log("LinkedIn profile of " + username + " updated at " + new Date());
          dbConnection.disconnect();
        });

        // update demographics data
        if (firstRequest) {
          batch.updateDemographicsForUser(profile.username);
        }

        callback(profile);
      });
    }
  });
};

exports.updateUserProfile = updateUserProfile;