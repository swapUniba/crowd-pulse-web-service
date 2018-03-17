'use strict';

var router = require('express').Router();
var request = require('request');
var qs = require('querystring');
var CrowdPulse = require('./../crowd-pulse-data');
var databaseName = require('./../crowd-pulse-data/databaseName');
var config = require('./../lib/config');
var FitbitProfileSchema = require('./../crowd-pulse-data/schema/fitbitProfile');
var batch = require('./../lib/batchOperations');

const DB_PROFILES = databaseName.profiles;
const CLIENT_SECRET = '1f101a074fd47e66d6bfe4bb6b40c916';
const CLIENT_ID = '22CFWK';
const PERMISSIONS = 'activity heartrate location nutrition profile settings sleep social weight';

const API_ACCESS_TOKEN = 'https://api.fitbit.com/oauth2/token';
const API_LOGIN_DIALOG = 'https://www.fitbit.com/oauth2/authorize?';
const API_USER_DATA = 'https://api.fitbit.com/1/user/-/profile.json';
const API_USER_ACTIVITY_DATA = 'https://api.fitbit.com/1/user/-/activities/steps/date/today/1y.json';
const API_USER_BODY_AND_WEIGHT_DATA = 'https://api.fitbit.com/1/user/-/body/log/weight/date/today/1y.json';
const API_USER_BODY_AND_FAT_DATA = 'https://api.fitbit.com/1/user/-/body/log/fat/date/today/1y.json';
const API_USER_HEARTRATE_DATA = 'https://api.fitbit.com/1/user/-/activities/heart/date/today/1m.json';
const API_USER_DEVICES_DATA = 'https://api.fitbit.com/1/user/-/devices.json';
const API_USER_FOOD_DATA = 'https://api.fitbit.com/1/user/-/foods/log/caloriesIn/date/today/1y.json';
const API_USER_FRIENDS_DATA = 'https://api.fitbit.com/1/user/-/friends.json';
const API_USER_SLEEP_DATA = 'https://api.fitbit.com/1.2/user/-/sleep/date/2017-12-01/2017-12-31.json';






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
   * Get Fitbit user activities.
   */
  router.route('/fitbit/activity')
    .get(function (req, res) {
      try {
        updateUserActivity(req.session.username, function (activities){

          if (activities)
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
   * Get Fitbit user Body & Weight.
   */
  router.route('/fitbit/body_weight')
    .get(function (req, res) {
      try {
        updateUserBodyWeight(req.session.username, function (weight){

          if (weight)
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
   * Get Fitbit user Devices.
   */
  router.route('/fitbit/devices')
    .get(function (req, res) {
      try {
        updateUserDevices(req.session.username, function (devices){

          if (devices)
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
   * Get Fitbit user Food.
   */
  router.route('/fitbit/food')
    .get(function (req, res) {
      try {
        updateUserFood(req.session.username, function (foods){

          if (foods)
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
   * Get Fitbit user Friends.
   */
  router.route('/fitbit/friends')
    .post(function (req, res) {
      try {
        var friendsNumber = req.body.friendsNumber;

        // if the client do not specify a friends number to read then update the user friends
        if (!friendsNumber) {
          updateUserFriends(req.session.username).then(function () {
            res.status(200);
            res.json({auth: true});
          });
        } else {

          // return the friends
          var dbConnection = new CrowdPulse();
          return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
            return conn.Connection.find({source: /fitbit/}).limit(friendsNumber);
          }).then(function (friends) {
            dbConnection.disconnect();
            res.status(200);
            res.json({auth: true, friends: friends});
          });
        }

      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });



  /**
   * Get Fitbit user Heart Rate.
   */
  router.route('/fitbit/heartrate')
    .get(function (req, res) {
      try {
        updateUserHeartRate(req.session.username, function (heartrate){

          if (heartrate)
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
   * Get Fitbit user Sleep.
   */
  router.route('/fitbit/sleep')
    .post(function (req, res) {
      try {
        var sleepNumber = req.body.sleepNumber;

        // if the client do not specify a sleep number to read then update the user sleep
        if (!sleepNumber) {
          updateUserSleep(req.session.username).then(function () {
            res.status(200);
            res.json({auth: true});
          });
        } else {

          // return the sleep
          var dbConnection = new CrowdPulse();
          return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
            return conn.PersonalData.find({source: /fitbit/}).limit(sleepNumber);
          }).then(function (sleep) {
            dbConnection.disconnect();
            res.status(200);
            res.json({auth: true, sleep: sleep});
          });
        }

      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });



  /**
   * Delete Fitbit information account.
   */
  router.route('/fitbit/delete')
    .delete(function (req, res) {
      try {
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
          return conn.Profile.findOne({username: req.session.username}, function (err, profile) {
            if (profile) {

              var fitbitId = profile.identities.fitbit.fitbitId;
              deleteSleep(fitbitId, req.session.username);
              deleteSleep(fitbitId, databaseName.globalData);
              deleteFriend(req.session.username, req.session.username);
              deleteFriend(req.session.username, databaseName.globalData);

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
 * Update the user activities information.
 * @param username
 * @param callback
 */
var updateUserActivity = function(username, callback) {

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
          url: API_USER_ACTIVITY_DATA,
          headers: { 'Authorization': 'Bearer ' + fitbitConfig.accessToken },
          json: true
        };

      if (fitbitConfig.accessToken)
      {
        // true if it is the first time user requests fitbit profile
        var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;

        // retrieve profile information about the current user
        request.get(params, function(err, response, userActivity)
        {
          console.log(userActivity);

          if (response.statusCode !== 200)
          {
            return err;
          }

          if (firstRequest)
          {
            // share default value
            fitbitConfig.shareActivity = true;
          }
    /*
          var i = 0;
          while (i < userActivity.activities.length) {
            profile.identities.configs.fitbitConfig.activities.push({
              activityId: userActivity.activities[i].activityId,
              calories: userActivity.activities[i].calories,
              description: userActivity.activities[i].description,
              distance: userActivity.activities[i].distance,
              duration: userActivity.activities[i].duration,
              startTime: userActivity.activities[i].startTime,
              steps: userActivity.activities[i].steps
            });
            i++;
          }

          profile.save().then(function () {
            console.log("Fitbit profile of " + username + " updated at " + new Date());
            dbConnection.disconnect();
          });

          // update demographics data
          if (firstRequest) {
            batch.updateDemographicsForUser(profile.username);
          }

          callback(profile);*/
        });
      } else {
        callback(null);
        dbConnection.disconnect();
      }
    });
  });
};




/**
 * Update the user body and weight information.
 * @param username
 * @param callback
 */
var updateUserBodyWeight = function(username, callback) {

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
          url: API_USER_BODY_AND_WEIGHT_DATA,
          headers: { 'Authorization': 'Bearer ' + fitbitConfig.accessToken },
          json: true
        };

      if (fitbitConfig.accessToken)
      {
        // true if it is the first time user requests fitbit profile
        var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;

        // retrieve profile information about the current user
        request.get(params, function(err, response, userBodyWeight)
        {
          console.log(userBodyWeight);

          if (response.statusCode !== 200)
          {
            return err;
          }

          if (firstRequest)
          {
            // share default value
            fitbitConfig.shareBody_Weight = true;
          }
          /*
           var i = 0;
           while (i < userActivity.activities.length) {
           profile.identities.configs.fitbitConfig.activities.push({
           activityId: userActivity.activities[i].activityId,
           calories: userActivity.activities[i].calories,
           description: userActivity.activities[i].description,
           distance: userActivity.activities[i].distance,
           duration: userActivity.activities[i].duration,
           startTime: userActivity.activities[i].startTime,
           steps: userActivity.activities[i].steps
           });
           i++;
           }

           profile.save().then(function () {
           console.log("Fitbit profile of " + username + " updated at " + new Date());
           dbConnection.disconnect();
           });

           // update demographics data
           if (firstRequest) {
           batch.updateDemographicsForUser(profile.username);
           }

           callback(profile);*/
        });
      } else {
        callback(null);
        dbConnection.disconnect();
      }
    });
  });
};


/**
 * Update the user devices information.
 * @param username
 * @param callback
 */
var updateUserDevices = function(username, callback) {

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
          url: API_USER_DEVICES_DATA,
          headers: { 'Authorization': 'Bearer ' + fitbitConfig.accessToken },
          json: true
        };

      if (fitbitConfig.accessToken)
      {
        // true if it is the first time user requests fitbit profile
        var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;

        // retrieve profile information about the current user
        request.get(params, function(err, response, userDevices)
        {
          console.log(userDevices);

          if (response.statusCode !== 200)
          {
            return err;
          }

          if (firstRequest)
          {
            // share default value
            fitbitConfig.shareDevices = true;
          }
          /*
           var i = 0;
           while (i < userActivity.activities.length) {
           profile.identities.configs.fitbitConfig.activities.push({
           activityId: userActivity.activities[i].activityId,
           calories: userActivity.activities[i].calories,
           description: userActivity.activities[i].description,
           distance: userActivity.activities[i].distance,
           duration: userActivity.activities[i].duration,
           startTime: userActivity.activities[i].startTime,
           steps: userActivity.activities[i].steps
           });
           i++;
           }

           profile.save().then(function () {
           console.log("Fitbit profile of " + username + " updated at " + new Date());
           dbConnection.disconnect();
           });

           // update demographics data
           if (firstRequest) {
           batch.updateDemographicsForUser(profile.username);
           }

           callback(profile);*/
        });
      } else {
        callback(null);
        dbConnection.disconnect();
      }
    });
  });
};



/**
 * Update the user food information.
 * @param username
 * @param callback
 */
var updateUserFood = function(username, callback) {

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
          url: API_USER_FOOD_DATA,
          headers: { 'Authorization': 'Bearer ' + fitbitConfig.accessToken },
          json: true
        };

      if (fitbitConfig.accessToken)
      {
        // true if it is the first time user requests fitbit profile
        var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;

        // retrieve profile information about the current user
        request.get(params, function(err, response, userFood)
        {
          console.log(userFood);

          if (response.statusCode !== 200)
          {
            return err;
          }

          if (firstRequest)
          {
            // share default value
            fitbitConfig.shareFood = true;
          }
          /*
           var i = 0;
           while (i < userActivity.activities.length) {
           profile.identities.configs.fitbitConfig.activities.push({
           activityId: userActivity.activities[i].activityId,
           calories: userActivity.activities[i].calories,
           description: userActivity.activities[i].description,
           distance: userActivity.activities[i].distance,
           duration: userActivity.activities[i].duration,
           startTime: userActivity.activities[i].startTime,
           steps: userActivity.activities[i].steps
           });
           i++;
           }

           profile.save().then(function () {
           console.log("Fitbit profile of " + username + " updated at " + new Date());
           dbConnection.disconnect();
           });

           // update demographics data
           if (firstRequest) {
           batch.updateDemographicsForUser(profile.username);
           }

           callback(profile);*/
        });
      } else {
        callback(null);
        dbConnection.disconnect();
      }
    });
  });
};



/**
 * Update the user friends information.
 * @param username
 * @param callback
 */
var updateUserFriends = function(username, callback) {

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      var fitbitConfig = profile.identities.configs.fitbitConfig;

      var params =
        {
          url: API_USER_FRIENDS_DATA,
          headers: { 'Authorization': 'Bearer ' + fitbitConfig.accessToken },
          json: true
        };

      if (fitbitConfig.accessToken) {
        // true if it is the first time user requests fitbit profile
        var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
        var share = fitbitConfig.shareFriends;


        // retrieve profile information about the current user
        request.get(params, function (err, response, userFriends) {

          if (response.statusCode !== 200) {
            return err;
          }

          if (firstRequest) {
            // share default value
            fitbitConfig.shareFriends = true;
          }

          var i = 0;
          var friendsToSave = [];
          while (i < userFriends.friends.length) {
            friendsToSave.push({
              username: userFriends.friends[i].user.displayName,
              contactId: userFriends.friends[i].user.encodedId,
              contactName: userFriends.friends[i].user.fullName,
              source: 'fitbit',
              share: true
            });
            i++;
          }

          storeFriends(friendsToSave, username).then(function () {
            storeFriends(friendsToSave, databaseName.globalData);
          });
        });
      }
    });
  });
};


/**
 * Update the user heart rate information.
 * @param username
 * @param callback
 */
var updateUserHeartRate = function(username, callback) {

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
          url: API_USER_HEARTRATE_DATA,
          headers: { 'Authorization': 'Bearer ' + fitbitConfig.accessToken },
          json: true
        };

      if (fitbitConfig.accessToken)
      {
        // true if it is the first time user requests fitbit profile
        var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;

        // retrieve profile information about the current user
        request.get(params, function(err, response, userHeartRate)
        {
          console.log(userHeartRate);

          if (response.statusCode !== 200)
          {
            return err;
          }

          if (firstRequest)
          {
            // share default value
            fitbitConfig.shareHeartRate = true;
          }
          /*
           var i = 0;
           while (i < userActivity.activities.length) {
           profile.identities.configs.fitbitConfig.activities.push({
           activityId: userActivity.activities[i].activityId,
           calories: userActivity.activities[i].calories,
           description: userActivity.activities[i].description,
           distance: userActivity.activities[i].distance,
           duration: userActivity.activities[i].duration,
           startTime: userActivity.activities[i].startTime,
           steps: userActivity.activities[i].steps
           });
           i++;
           }

           profile.save().then(function () {
           console.log("Fitbit profile of " + username + " updated at " + new Date());
           dbConnection.disconnect();
           });

           // update demographics data
           if (firstRequest) {
           batch.updateDemographicsForUser(profile.username);
           }

           callback(profile);*/
        });
      } else {
        callback(null);
        dbConnection.disconnect();
      }
    });
  });
};



/**
 * Update the user sleep information.
 * @param username
 * @param callback
 */
var updateUserSleep = function(username, callback) {

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var fitbitConfig = profile.identities.configs.fitbitConfig;

        var params =
          {
            url: API_USER_SLEEP_DATA,
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        if (fitbitConfig.accessToken) {
          // true if it is the first time user requests fitbit profile
          var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
          var share = fitbitConfig.shareSleep;


          // retrieve profile information about the current user
          request.get(params, function (err, response, userSleep) {
            console.log(userSleep);
            if (response.statusCode !== 200) {
              return err;
            }

            if (firstRequest) {
              // share default value
              fitbitConfig.shareSleep = true;
            }

            var i = 0;
            var sleepToSave = [];
            while (i < userSleep.sleep.length) {
              console.log('dentro il while');

              sleepToSave.push({
                deviceId: 'fitbit',
                username: username,
                timestamp: new Date(userSleep.sleep[i].startTime).getTime(),
                duration: userSleep.sleep[i].duration,
                efficiency: userSleep.sleep[i].efficiency,
                minutesAfterWakeup: userSleep.sleep[i].minutesAfterWakeup,
                minutesAsleep: userSleep.sleep[i].minutesAsleep,
                minutesAwake: userSleep.sleep[i].minutesAwake,
                minutesToFallAsleep: userSleep.sleep[i].minutesToFallAsleep,
                timeInBed: userSleep.sleep[i].timeInBed,
                source: 'fitbit-sleep',
                share: true
              });
              i++;
            }

            storeSleep(sleepToSave, username).then(function () {
              storeSleep(sleepToSave, databaseName.globalData);
            });
          });
        }
      }
    });
  });
};


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


/**
* Store friends in the MongoDB database
* @param friends
* @param databaseName
*/
var storeFriends = function(friends, databaseName) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    if (friends.length <= 0) {
      return dbConnection.disconnect();
    }

    // loop function to insert friends data synchronously
    (function loop (i) {
      var friend = friends[i];
      conn.Connection.findOneAndUpdate({
        username: friend.username,
        source: 'fitbit',
        contactId: friend.contactId
      }, friend, {upsert: true}, function () {
        i++;
        if (i >= friends.length) {

          console.log(friends.length + " Fitbit friends for " + friend.username + " saved or updated into " + databaseName);
          return dbConnection.disconnect();
        } else {
          loop(i);
        }
      });
    })(0);

  });
};




/**
 * Store sleep in the MongoDB database
 * @param sleep
 * @param databaseName
 */
var storeSleep = function(sleeps, databaseName) {
  console.log('dentro store');

  var dbConnection = new CrowdPulse();
  var sleepSaved = 0;
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    if (sleeps.length <= 0) {
      return dbConnection.disconnect();
    }
    sleeps.forEach(function (sleep) {
      console.log('dentro foreach');
      console.log(sleep);

      return conn.PersonalData.newFromObject(sleep).save().then(function () {
        sleepSaved++;
        console.log('dentro personal Data');

        if (sleepSaved >= sleeps.length) {
          console.log(sleeps.length + " sleeps from Fitbit saved in " + databaseName + " at " + new Date());
          return dbConnection.disconnect();
        }
      });
    });
  });
};



/**
 * Delete sleep stored in the MongoDB database
 * @param username
 * @param databaseName
 */
var deleteSleep = function(username, databaseName) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    return conn.PersonalData.deleteMany({username: username, source: /fitbit.*/}, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Fitbit friends deleted from " + databaseName + " at " + new Date());
      }
      return dbConnection.disconnect();
    });
  });
};





/**
 * Delete friends stored in the MongoDB database
 * @param username
 * @param databaseName
 */
var deleteFriend = function(username, databaseName) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    return conn.Connection.deleteMany({username: username, source: /fitbit.*/}, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Fitbit friends deleted from " + databaseName + " at " + new Date());
      }
      return dbConnection.disconnect();
    });
  });
};




exports.updateUserProfile = updateUserProfile;
exports.updateUserActivity = updateUserActivity;
exports.updateUserBodyWeight = updateUserBodyWeight;
exports.updateUserFood = updateUserFood;
exports.updateUserFriends = updateUserFriends;
exports.updateUserDevices = updateUserDevices;
exports.updateUserHeartRate = updateUserHeartRate;
exports.updateUserSleep = updateUserSleep;