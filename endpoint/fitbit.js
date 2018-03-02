'use strict';

var router = require('express').Router();
var request = require('request');
var qs = require('querystring');
var CrowdPulse = require('./../crowd-pulse-data');
var databaseName = require('./../crowd-pulse-data/databaseName');
var config = require('./../lib/config');
var cookieParser = require('cookie-parser');
var FitbitProfileSchema = require('./../crowd-pulse-data/schema/fitbitProfile');
var batch = require('./../lib/batchOperations');
var redirect_uri = 'http://localhost:4200/identities/fitbit/callback';

const DB_PROFILES = databaseName.profiles;
const CLIENT_SECRET = '1f101a074fd47e66d6bfe4bb6b40c916';
const CLIENT_ID = '22CFWK';

//const FIELDS = ['id', 'email', 'first_name', 'last_name', 'middle_name', 'link', 'name', 'age_range', 'gender',
  //'languages', 'quotes'];

const PERMISSIONS = 'activity heartrate location nutrition profile settings sleep social weight';

const API_ACCESS_TOKEN = 'https://api.fitbit.com/oauth2/token';
const API_LOGIN_DIALOG = 'https://www.fitbit.com/oauth2/authorize?';
const API_USER_DATA = 'https://api.fitbit.com/1/user/-/profile.json';
const API_USER_ACTIVITY = 'https://api.fitbit.com/1/user/-/activities/steps/date/today/1y.json';
const API_USER_BODY_AND_WEIGHT = 'https://api.fitbit.com/1/user/-/body/weight/date/today/1y.json';
const API_USER_HEARTRATE = 'https://api.fitbit.com/1/user/-/activities/heart/date/today/1m.json';
const API_USER_DEVICES = 'https://api.fitbit.com/1/user/-/devices.json';
const API_USER_FOOD = 'https://api.fitbit.com/1/user/-/foods/log/caloriesIn/date/today/1y.json';
const API_USER_FRIENDS = 'https://api.fitbit.com/1/user/-/friends.json';
const API_USER_SLEEP = 'https://api.fitbit.com/1.2/user/-/sleep/date/2017-01-27/2018-02-27.json';





exports.endpoint = function() {

  /**
   * Creates a login dialog URL.
   * Params:
   *    callbackUrl - the url send to Fitbit as callback
   */
  router.route('/fitbit/login_dialog')
    .post(function (req, res) {
      try {
        var params = {
          response_type: 'code',
          client_id: CLIENT_ID,
          scope: PERMISSIONS,
          redirect_uri: req.body.callbackUrl,
          state: 'state'

        };
        var loginDialogUrl = API_LOGIN_DIALOG + qs.stringify(params);
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
   *    code - the authorization code returned by Fitbit after user login
   *    callbackUrl - the url send to Fitbit as callback
   */
  router.route('/fitbit/request_token')
    .post(function (req, res) {
      try {

        var params = {
          url: API_ACCESS_TOKEN,
          form: {
            code: req.body.code,
            redirect_uri: req.body.callbackUrl,
            grant_type: 'authorization_code'
          },
          headers: {
            'Authorization': 'Basic ' + (new Buffer(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
          },
          json: true
        };

        request.post(params, function(err, response, oauthData){
        if (response.statusCode !== 200 || err) {
            res.sendStatus(500);
          } else {

            // save access token in the database

            var dbConnection = new CrowdPulse();
            return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
              return conn.Profile.findOne({username: req.session.username}, function (err, profile) {
                if (profile) {

                  profile.identities.configs.fitbitConfig = {
                    accessToken: oauthData.access_token,
                    expiresIn: oauthData.expires_in
                  };
                  profile.save();

                  res.status(200);
                  res.json({auth: true});

                } else {
                  return res.sendStatus(500);
                }
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
   * Get Fitbit user profile information.
   */
  router.route('/fitbit/profile')
    .get(function (req, res) {
      try {
        updateUserProfile(req.session.username, function (profile) {
          if (profile)
          {
            res.status(200);
            res.json({auth: true, user: profile});
          } else {
            res.status(400);
            res.json({auth: true});
          }
        });
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });

  /**
   * Update Fitbit configuration reading parameters from query.
   */
  router.route('/fitbit/config')
    .get(function (req, res) {
      try {
        var params = req.query;
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
          return conn.Profile.findOne({username: req.session.username}, function (err, user) {
            if (user) {

              if (params.shareProfile !== null && params.shareProfile !== undefined)
              {
                user.identities.configs.fitbitConfig.shareProfile = params.shareProfile;
              }
              user.save();
              res.status(200);
              res.json({auth: true});
            }
            else
            {
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
   * Get Fitbit user posts.
   * Params:
   *    messages - the number of messages to retrieve
   */

  /*todo*/

  /**
   * Get Fitbit user likes.
   * Params:
   *    likesNumber - the number of likes to retrieve
   */

  /*todo*/

  /**
   * Get Fitbit user friends (only users that use the App).
   * Params:
   *    friendsNumber - the number of friends to retrieve
   */

  /*todo*/

  /**
   * Delete Fitbit information account, including posts and likes.
   */
  router.route('/fitbit/delete')
    .delete(function (req, res) {
      try {
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
          return conn.Profile.findOne({username: req.session.username}, function (err, profile) {
            if (profile)
            {
              profile.identities.fitbit = undefined;
              profile.identities.configs.fitbitConfig = undefined;
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
 * Update the user profile information, activity, devices, food, friends, heart rate, sleep.
 * @param username
 * @param callback
 */
var updateUserProfile = function(username, callback) {

  // default empty callback
  if (!callback)
  {
    callback = function () {}
  }

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      var fitbitConfig = profile.identities.configs.fitbitConfig;

      var params =
      {
        url: API_USER_DATA,
        headers: { 'Authorization': 'Bearer ' + fitbitConfig.accessToken },
        json: true
      };

      if (fitbitConfig.accessToken)
      {
        // true if it is the first time user requests fitbit profile
        var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;

        // retrieve profile information about the current user
        request.get(params, function(err, response, userData)
        {

          if (response.statusCode !== 200)
          {
            return err;
          }

          if (firstRequest)
          {
            // share default value
            fitbitConfig.shareProfile = true;
          }

          // save the Fitbit user ID
          if (userData.user.encodedId)
          {
            profile.identities.fitbit.fitbitId = userData.user.encodedId;
            profile.identities.configs.fitbitConfig.fitbitId = userData.user.encodedId;
          }

          // save other user fitbit data
          for (var key in FitbitProfileSchema)
          {
            if (FitbitProfileSchema.hasOwnProperty(key) && userData.user[key])
            {
              profile.identities.fitbit[key] = userData.user[key];
            }
          }

          // change profile picture
          if (profile.identities.fitbit.avatar)
          {
            profile.pictureUrl = profile.identities.fitbit.avatar;
          }

          profile.save().then(function () {
            console.log("Fitbit profile of " + username + " updated at " + new Date());
            dbConnection.disconnect();
          });

          // update demographics data
          if (firstRequest) {
            batch.updateDemographicsForUser(profile.username);
          }

          callback(profile);
        });
      } else {
        callback(null);
        dbConnection.disconnect();
      }
    });
  });
};



/**
 * Store activity, devices, food, friends, heart rate, sleep. in the MongoDB database
 * @param likes
 * @param databaseName
 */

//TODO


/**
 * Delete messages stored in the MongoDB database
 * @param username
 * @param databaseName
 */

//TODO

/**
 * Update share option for messages , friends, likes.
 * @param userId
 * @param databaseName
 * @param share
 */

//TODO



exports.updateUserProfile = updateUserProfile;
/* exports.updatePosts = updatePosts;
exports.updateLikes = updateLikes;
exports.updateFriends = updateFriends;
};*/
