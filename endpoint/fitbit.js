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
const CLIENT_SECRET = '7bafb651e6be29b748dc20e52a6c68a0';
const CLIENT_ID = '22CP24';
const PERMISSIONS = 'activity heartrate location nutrition profile settings sleep social weight';

const API_ACCESS_TOKEN = 'https://api.fitbit.com/oauth2/token';
const API_LOGIN_DIALOG = 'https://www.fitbit.com/oauth2/authorize?';
const API_USER_DATA = 'https://api.fitbit.com/1/user/-/profile.json';


const API_USER_BODY_AND_WEIGHT_DATA = 'https://api.fitbit.com/1/user/-/body/weight/date/today/1y.json';
const API_USER_BODY_AND_FAT_DATA = 'https://api.fitbit.com/1/user/-/body/fat/date/today/1y.json';
const API_USER_BODY_AND_BMI_DATA = 'https://api.fitbit.com/1/user/-/body/bmi/date/today/1y.json';
const API_USER_DAILY_BODY_AND_WEIGHT_DATA = 'https://api.fitbit.com/1/user/-/body/weight/date/today/1d.json';
const API_USER_DAILY_BODY_AND_FAT_DATA = 'https://api.fitbit.com/1/user/-/body/fat/date/today/1d.json';
const API_USER_DAILY_BODY_AND_BMI_DATA = 'https://api.fitbit.com/1/user/-/body/bmi/date/today/1d.json';

const API_USER_HEARTRATE_DATA = 'https://api.fitbit.com/1/user/-/activities/heart/date/today/1m.json';
const API_USER_DAILY_HEARTRATE_DATA = 'https://api.fitbit.com/1/user/-/activities/heart/date/today/1d.json';


const API_USER_FOOD_DATA = 'https://api.fitbit.com/1/user/-/foods/log/caloriesIn/date/today/1y.json';
const API_USER_DAILY_FOOD_DATA = 'https://api.fitbit.com/1/user/-/foods/log/caloriesIn/date/today/1d.json';

const API_USER_FRIENDS_DATA = 'https://api.fitbit.com/1/user/-/friends.json';
const API_USER_SLEEP_DATA = 'https://api.fitbit.com/1.2/user/-/sleep/date/';

const API_USER_DAILY_ACTIVITY = 'https://api.fitbit.com/1/user/-/activities/date/';
const API_USER_ACTIVITY_STEPS = 'https://api.fitbit.com/1/user/-/activities/steps/date/today/1y.json';
const API_USER_ACTIVITY_DISTANCE = 'https://api.fitbit.com/1/user/-/activities/distance/date/today/1y.json';
const API_USER_ACTIVITY_FLOORS = 'https://api.fitbit.com/1/user/-/activities/floors/date/today/1y.json';
const API_USER_ACTIVITY_ELEVATION = 'https://api.fitbit.com/1/user/-/activities/elevation/date/today/1y.json';
const API_USER_ACTIVITY_MINUTES_SEDENTARY = 'https://api.fitbit.com/1/user/-/activities/minutesSedentary/date/today/1y.json';
const API_USER_ACTIVITY_MINUTES_LIGHTLY_ACTIVE = 'https://api.fitbit.com/1/user/-/activities/minutesLightlyActive/date/today/1y.json';
const API_USER_ACTIVITY_MINUTES_FAIRLY_ACTIVE = 'https://api.fitbit.com/1/user/-/activities/minutesFairlyActive/date/today/1y.json';
const API_USER_ACTIVITY_MINUTES_VERY_ACTIVE = 'https://api.fitbit.com/1/user/-/activities/minutesVeryActive/date/today/1y.json';
const API_USER_ACTIVITY_ACTIVITY_CALORIES = 'https://api.fitbit.com/1/user/-/activities/activityCalories/date/today/1y.json';





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
                    expiresIn: oauthData.expires_in,
                    refreshToken: oauthData.refresh_token
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
   * Refresh access token.
   * Params:
   *    code - the authorization code returned by Fitbit after user login
   *    callbackUrl - the url send to Fitbit as callback
   */
  router.route('/fitbit/refresh_token')
    .post(function (req, res) {
      try {

        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
          return conn.Profile.findOne({username: req.session.username}, function (err, profile) {

            var params = {
              url: API_ACCESS_TOKEN,
              form: {
                grant_type: 'refresh_token',
                refresh_token :  profile.identities.configs.fitbitConfig.refreshToken,
                expires_in : 28800
              },
              headers: {
                'Authorization': 'Basic ' + (new Buffer(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
              },
              json: true
            };



            request.post(params, function(err, response, refreshToken){

              if (response.statusCode !== 200 || err) {
                res.sendStatus(500);
              } else {

                // save access token in the database
                    if (profile) {

                      profile.identities.configs.fitbitConfig = {
                        accessToken: refreshToken.access_token,
                        refreshToken: refreshToken.refresh_token,
                        expiresIn: refreshToken.expires_in
                      };

                      profile.save();

                      res.status(200);
                      res.json({auth: true});

                    } else {
                      return res.sendStatus(500);
                    }
              }
            });



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
    .post(function (req, res) {
      try {

        var dbConnection1 = new CrowdPulse();
        return dbConnection1.connect(config.database.url, req.session.username).then(function (conn) {
          return conn.PersonalData.count({source: /fitbit-activity/});
        }).then(function (numberActivities) {
          dbConnection1.disconnect();
          var activityNumber = req.body.activityNumber;

          if (numberActivities > 0 )
          {
            // return the activity
            var dbConnection = new CrowdPulse();
            return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
              return conn.PersonalData.find({source: /fitbit-activity/}).sort({timestamp: -1});
            }).then(function (activities) {

              var i = 0, flag1 = 0, flag2 = 0, flag3 = 0, flag4 = 0, flag5 = 0,flag6 = 0, flag7 = 0, flag8 = 0, flag9 = 0;
              var calories = [],fairly = [], minutesLightlyActive = [], veryActive = [], minutesSedentary = [],
                elevation = [], floors = [], steps = [], distance = [];
              while(i < activities.length)
              {
                if (activities[i].nameActivity === "calories" && flag1 < 2)
                {
                  calories = [activities[i].timestamp, activities[i].activityCalories];
                  flag1 = flag1+1;
                }

                if (activities[i].nameActivity === "fairly" && flag2 < 2)
                {
                  fairly = [activities[i].timestamp, activities[i].minutesFairlyActive];
                  flag2 = flag2+1;
                }

                if (activities[i].nameActivity === "minutesLightlyActive" && flag3 < 2)
                {
                  minutesLightlyActive = [activities[i].timestamp, activities[i].minutesLightlyActive];
                  flag3 = flag3+1;
                }

                if (activities[i].nameActivity === "veryActive" && flag4 < 2)
                {
                  veryActive = [activities[i].timestamp, activities[i].minutesVeryActive];
                  flag4 = flag4+1;
                }

                if (activities[i].nameActivity === "minutesSedentary" && flag5 < 2)
                {
                  minutesSedentary = [activities[i].timestamp, activities[i].minutesSedentary];
                  flag5 = flag5+1;
                }

                if (activities[i].nameActivity === "elevation" && flag6 < 2)
                {
                  elevation = [activities[i].timestamp, activities[i].elevation];
                  flag6 = flag6+1;
                }

                if (activities[i].nameActivity === "floors" && flag7 < 2)
                {
                  floors = [activities[i].timestamp, activities[i].floors];
                  flag7 = flag7+1;
                }

                if (activities[i].nameActivity === "steps" && flag8 < 2)
                {
                  steps = [activities[i].timestamp, activities[i].steps];
                  flag8 = flag8+1;
                }

                if (activities[i].nameActivity === "distance" && flag9 < 2)
                {
                  distance = [activities[i].timestamp, activities[i].distance];
                  flag9 = flag9+1;
                }

                i = i + 1;
              }
              res.status(200);
              res.json({auth: true, distance: distance, steps : steps, floors : floors, elevation : elevation,
                minutesSedentary : minutesSedentary, veryActive : veryActive, minutesLightlyActive : minutesLightlyActive,
                fairly : fairly, calories : calories });
            });

          }
          else if (numberActivities == 0){
            // if the client do not specify a activities number to read then update the user activity
            if (!activityNumber) {
              updateUserActivity(req.session.username).then(function () {
                res.status(200);
                res.json({auth: true});
              });
            }
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
    .post(function (req, res) {
      try {
        var weightNumber = req.body.bodyNum;

        // if the client do not specify a weight number to read then update the user weight
        if (!weightNumber) {
          updateUserBodyWeight(req.session.username).then(function () {
            res.status(200);
            res.json({auth: true});
          });
        } else {

          // return the weight
          var dbConnection = new CrowdPulse();
          return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
            return conn.PersonalData.find({nameBody: /weight/}).limit(weightNumber).sort({timestamp: -1});
          }).then(function (weight) {
            dbConnection.disconnect();
            res.status(200);
            res.json({auth: true, weight: weight});
          });
        }

      } catch (err) {
        console.log(err);
        res.sendStatus(500);
      }
    });


  /**
   * Get Fitbit user weight from Myrror -> Profile -> Data.
   */
  router.route('/fitbit/weight_date')
    .post(function (req, res) {
      try {
        var weightsNumber = req.body.weightsNumber;
        var dateFrom = new Date(req.body.dateFrom).getTime();
        var dateTo = new Date(req.body.dateTo).getTime();

        // return the weight between data range
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
          return conn.PersonalData.find({ $and: [{nameBody:/weight/},{ timestamp: { $gte: dateFrom, $lte: dateTo}} ]}).limit(weightsNumber).sort({timestamp: -1});
        }).then(function (weights) {
          dbConnection.disconnect();
          res.status(200);
          res.json({auth: true, weights: weights});
        });

      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });



  /**
   * Get Fitbit user Body & Fat.
   */
  router.route('/fitbit/body_fat')
    .post(function (req, res) {
      try {
        var fatNumber = req.body.fatNum;

        // if the client do not specify a fat number to read then update the user fat
        if (!fatNumber) {
          updateUserBodyFat(req.session.username).then(function () {
            res.status(200);
            res.json({auth: true});
          });
        } else {

          // return the fat
          var dbConnection = new CrowdPulse();
          return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
            return conn.PersonalData.find({nameBody: /fat/}).limit(fatNumber).sort({timestamp: -1});
          }).then(function (fat) {
            dbConnection.disconnect();
            res.status(200);
            res.json({auth: true, fat: fat});
          });
        }

      } catch (err) {
        console.log(err);
        res.sendStatus(500);
      }
    });



  /**
  * Get Fitbit user fats from Myrror -> Profile -> Data.
  */
  router.route('/fitbit/fat_date')
    .post(function (req, res) {
      try {
        var fatsNumber = req.body.fatsNumber;
        var dateFrom = new Date(req.body.dateFrom).getTime();
        var dateTo = new Date(req.body.dateTo).getTime();

        // return the fat between data range
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
          return conn.PersonalData.find({ $and: [{nameBody:/fat/},{ timestamp: { $gte: dateFrom, $lte: dateTo}} ]}).limit(fatsNumber).sort({timestamp: -1});
        }).then(function (fats) {
          dbConnection.disconnect();
          res.status(200);
          res.json({auth: true, fats: fats});
        });

      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });




  /**
   * Get Fitbit user Body & BMI.
   */
  router.route('/fitbit/body_bmi')
    .post(function (req, res) {
      try {
        var bmiNumber = req.body.bmiNum;

        // if the client do not specify a BMI number to read then update the user BMI
        if (!bmiNumber) {
          updateUserBodyBmi(req.session.username).then(function () {
            res.status(200);
            res.json({auth: true});
          });
        } else {

          // return the BMI
          var dbConnection = new CrowdPulse();
          return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
            return conn.PersonalData.find({nameBody: /BMI/}).limit(bmiNumber).sort({timestamp: -1});
          }).then(function (bmi) {
            dbConnection.disconnect();
            res.status(200);
            res.json({auth: true, bmi: bmi});
          });
        }

      } catch (err) {
        console.log(err);
        res.sendStatus(500);
      }
    });



  /**
   * Get Fitbit user fats from Myrror -> Profile -> Data.
   */
  router.route('/fitbit/bmi_date')
    .post(function (req, res) {
      try {
        var bmisNumber = req.body.bmisNumber;
        var dateFrom = new Date(req.body.dateFrom).getTime();
        var dateTo = new Date(req.body.dateTo).getTime();

        // return the BMI between data range
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
          return conn.PersonalData.find({ $and: [{nameBody:/BMI/},{ timestamp: { $gte: dateFrom, $lte: dateTo}} ]}).limit(bmisNumber).sort({timestamp: -1});
        }).then(function (bmis) {
          dbConnection.disconnect();
          res.status(200);
          res.json({auth: true, bmis: bmis});
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
    .post(function (req, res) {
      try {
        var foodNumber = req.body.foodNumber;

        // if the client do not specify a foods number to read then update the user food
        if (!foodNumber) {

          updateUserFood(req.session.username).then(function () {
            res.status(200);
            res.json({auth: true});
          });
        } else {

          // return the food
          var dbConnection = new CrowdPulse();
          return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
            return conn.PersonalData.find({source: /fitbit-food/}).limit(foodNumber);
          }).then(function (foods) {
            dbConnection.disconnect();
            res.status(200);
            res.json({auth: true, foods: foods});
          });
        }

      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });



  /**
   * Get Fitbit user Food from Myrror -> Profile -> Data.
   */
  router.route('/fitbit/food_date')
    .post(function (req, res) {
      try {
        var foodNumber = req.body.foodNumber;
        var dateFrom = new Date(req.body.dateFrom).getTime();
        var dateTo = new Date(req.body.dateTo).getTime();

        // return the food between data range
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
          return conn.PersonalData.find({ $and: [{source: /fitbit-food/},{ timestamp: { $gte: dateFrom, $lte: dateTo}} ]}).limit(foodNumber).sort({timestamp: -1});
        }).then(function (foods) {
          dbConnection.disconnect();
          res.status(200);
          res.json({auth: true, foods: foods});
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
    .post(function (req, res) {
      try {
        var dbConnection1 = new CrowdPulse();
        return dbConnection1.connect(config.database.url, req.session.username).then(function (conn) {
          return conn.PersonalData.count({source: /fitbit-heart/});
        }).then(function (numberHeart) {
          dbConnection1.disconnect();
          var heartNumber = req.body.heartNumber;

          if (numberHeart > 0)
          {

            // return the heartrate
            var dbConnection = new CrowdPulse();
            return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
              return conn.PersonalData.find({source: /fitbit-heart/}).limit(heartNumber);
            }).then(function (heart) {
              dbConnection.disconnect();
              res.status(200);
              res.json({auth: true, heart: heart});
            });

          }
          else if (numberHeart == 0){

              updateUserHeartRate(req.session.username).then(function () {
                res.status(200);
                res.json({auth: true});
              });
          }
        });
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });



  /**
   * Get Fitbit user Heart from Myrror -> Profile -> Data.
   */
  router.route('/fitbit/heart_date')
    .post(function (req, res) {
      try {
        var heartNumber = req.body.heartNumber;
        var dateFrom = new Date(req.body.dateFrom).getTime();
        var dateTo = new Date(req.body.dateTo).getTime();

        // return the heart rate between data range
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
          return conn.PersonalData.find({ $and: [{source: /fitbit-heart/},{ timestamp: { $gte: dateFrom, $lte: dateTo}} ]}).limit(heartNumber).sort({timestamp: -1});
        }).then(function (hearts) {
          dbConnection.disconnect();
          res.status(200);
          res.json({auth: true, hearts: hearts});
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

        var dbConnection1 = new CrowdPulse();
        return dbConnection1.connect(config.database.url, req.session.username).then(function (conn) {
          return conn.PersonalData.count({source: /fitbit-sleep/});
        }).then(function (numberSleep) {
          dbConnection1.disconnect();
          var sleepNumber = req.body.sleepNumber;

          if (numberSleep > 0 )
          {
            // return the sleep
            var dbConnection = new CrowdPulse();
            return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
              return conn.PersonalData.find({source: /fitbit-sleep/}).limit(sleepNumber).sort({timestamp: -1});
            }).then(function (sleep) {
              dbConnection.disconnect();
              res.status(200);
              res.json({auth: true, sleep: sleep});
            });

          }
          else if (numberSleep == 0){
            // if the client do not specify a sleep number to read then update the user sleep
            if (!sleepNumber) {
              updateUserSleep(req.session.username).then(function () {
                res.status(200);
                res.json({auth: true});
              });
            }
          }
        });

      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });


  /**
   * Get Fitbit user Sleep from Myrror -> Profile -> Data.
   */
  router.route('/fitbit/sleep_date')
    .post(function (req, res) {
      try {
        var sleepNumber = req.body.sleepNumber;
        var dateFrom = new Date(req.body.dateFrom).getTime();
        var dateTo = new Date(req.body.dateTo).getTime();

          // return the sleep between data range
          var dbConnection = new CrowdPulse();
          return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
            return conn.PersonalData.find({ $and: [{source: /fitbit-sleep/},{ timestamp: { $gte: dateFrom, $lte: dateTo}} ]}).limit(sleepNumber).sort({timestamp: -1});
          }).then(function (sleeps) {
            dbConnection.disconnect();
            res.status(200);
            res.json({auth: true, sleeps: sleeps});
          });

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
              deleteSleep(req.session.username, req.session.username);
              deleteSleep(req.session.username, databaseName.globalData);
              deleteBody(req.session.username, req.session.username);
              deleteBody(req.session.username, databaseName.globalData);
              deleteHeart(req.session.username, req.session.username);
              deleteHeart(req.session.username, databaseName.globalData);
              deleteFood(req.session.username, req.session.username);
              deleteFood(req.session.username, databaseName.globalData);
              deleteActivity(req.session.username, req.session.username);
              deleteActivity(req.session.username, databaseName.globalData);
              deleteFriend(req.session.username, req.session.username);
              deleteFriend(req.session.username, databaseName.globalData);


              profile.pictureUrl = undefined;
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
 * Update the user profile information.
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

        console.log('FITBIT: Daily profile extraction:'+  new Date().toDateString());
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
            fitbitConfig.shareBodyWeight = true;
            fitbitConfig.shareSleep = true;
            fitbitConfig.shareActivity = true;
            fitbitConfig.shareFood = true;
            fitbitConfig.shareFriends = true;
            fitbitConfig.shareHeartRate = true;
            fitbitConfig.shareBody_Bmi = true;
            fitbitConfig.shareBody_Fat = true;
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
var updateDailyActivity = function(username, callback, accessToken) {

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var fitbitConfig = profile.identities.configs.fitbitConfig;
        //setting data
        var dataodierna = new Date();

        var params =
          {
            url: API_USER_DAILY_ACTIVITY + dataodierna.toISOString().substring(0,10)+'.json',
            headers: {'Authorization': 'Bearer ' + accessToken},
            json: true
          };
        if (fitbitConfig.accessToken) {
          // true if it is the first time user requests fitbit profile
          var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
          var share = fitbitConfig.shareActivity;


          if (firstRequest) {
            // share default value
            fitbitConfig.shareActivity = true;
          }

          console.log('FITBIT: Daily activity extraction:'+  new Date().toDateString());

          // retrieve profile information about the calories
          request.get(params, function (err, response, userActivity) {
            if (response.statusCode !== 200) {
              return err;
            }
            var activityStepsToSave = [], activityCaloriesToSave = [], activityDistanceToSave = [],
              activityFairlyToSave = [], activityLightlyToSave = [], activitySedentaryToSave = [], activityVeryToSave = [];
              const time = new Date().getTime();
              if(userActivity.summary)
              {
                  activityStepsToSave.push({
                    deviceId: 'fitbit',
                    username: username,
                    timestamp: time,
                    steps: userActivity.summary.steps,
                    nameActivity: 'steps',
                    source: 'fitbit-activity',
                    share: true
                  });
                }


                storeActivity(activityStepsToSave,username).then(function () {
                  storeActivity(activityStepsToSave,databaseName.globalData);
                });


                  activityCaloriesToSave.push({
                    deviceId: 'fitbit',
                    username: username,
                    timestamp: time,
                    activityCalories: userActivity.summary.activityCalories,
                    nameActivity: 'calories',
                    source: 'fitbit-activity',
                    share: true
                  });

                storeActivity(activityCaloriesToSave,username).then(function () {
                  storeActivity(activityCaloriesToSave,databaseName.globalData);
                });


                  activityDistanceToSave.push({
                    deviceId: 'fitbit',
                    username: username,
                    timestamp: time,
                    distance: userActivity.summary.distances[1].distance,
                    nameActivity: 'distance',
                    source: 'fitbit-activity',
                    share: true
                  });

                storeActivity(activityDistanceToSave,username).then(function () {
                  storeActivity(activityDistanceToSave,databaseName.globalData);
                });



                    activityFairlyToSave.push({
                      deviceId: 'fitbit',
                      username: username,
                      timestamp: time,
                      minutesFairlyActive: userActivity.summary.fairlyActiveMinutes,
                      nameActivity: 'fairly',
                      source: 'fitbit-activity',
                      share: true
                    });

                storeActivity(activityFairlyToSave,username).then(function () {
                  storeActivity(activityFairlyToSave,databaseName.globalData);
                });


                  activityLightlyToSave.push({
                    deviceId: 'fitbit',
                    username: username,
                    timestamp: time,
                    minutesLightlyActive: userActivity.summary.lightlyActiveMinutes,
                    nameActivity: 'minutesLightlyActive',
                    source: 'fitbit-activity',
                    share: true
                  });

                storeActivity(activityLightlyToSave,username).then(function () {
                  storeActivity(activityLightlyToSave,databaseName.globalData);
                });


                activitySedentaryToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: time,
                  minutesSedentary: userActivity.summary.sedentaryMinutes,
                  nameActivity: 'minutesSedentary',
                  source: 'fitbit-activity',
                  share: true
                });

                storeActivity(activitySedentaryToSave,username).then(function () {
                  storeActivity(activitySedentaryToSave,databaseName.globalData);
                });


                  activityVeryToSave.push({
                    deviceId: 'fitbit',
                    username: username,
                    timestamp: time,
                    minutesVeryActive: userActivity.summary.veryActiveMinutes,
                    nameActivity: 'veryActive',
                    source: 'fitbit-activity',
                    share: true
                  });

                storeActivity(activityVeryToSave,username).then(function () {
                  storeActivity(activityVeryToSave,databaseName.globalData);
                });


            });
        }
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

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var fitbitConfig = profile.identities.configs.fitbitConfig;

        var params =
          {
            url: API_USER_ACTIVITY_ACTIVITY_CALORIES,
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        var params2 =
          {
            url: API_USER_ACTIVITY_DISTANCE,
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        var params3 =
          {
            url: API_USER_ACTIVITY_ELEVATION,
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        var params4 =
          {
            url: API_USER_ACTIVITY_FLOORS,
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        var params5 =
          {
            url: API_USER_ACTIVITY_MINUTES_FAIRLY_ACTIVE,
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        var params6 =
          {
            url: API_USER_ACTIVITY_MINUTES_LIGHTLY_ACTIVE,
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        var params7 =
          {
            url: API_USER_ACTIVITY_MINUTES_SEDENTARY,
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        var params8 =
          {
            url: API_USER_ACTIVITY_STEPS,
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        var params9 =
          {
            url: API_USER_ACTIVITY_MINUTES_VERY_ACTIVE,
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        if (fitbitConfig.accessToken) {
          // true if it is the first time user requests fitbit profile
          var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
          var share = fitbitConfig.shareActivity;


          if (firstRequest) {
            // share default value
            fitbitConfig.shareSleep = true;
          }


          // retrieve profile information about the calories
          request.get(params, function (err, response, userCalories) {
            if (response.statusCode !== 200) {
              return err;
            }


            var i = 0;
            var activityCaloriesToSave = [];
            while (i < userCalories['activities-activityCalories'].length) {
              if(userCalories['activities-activityCalories'][i].value > 0)
              {
                activityCaloriesToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userCalories['activities-activityCalories'][i].dateTime).getTime(),
                  activityCalories: userCalories['activities-activityCalories'][i].value,
                  nameActivity: 'calories',
                  source: 'fitbit-activity',
                  share: true
                });
              }
              i++;
            }

            storeActivity(activityCaloriesToSave,username).then(function () {
              storeActivity(activityCaloriesToSave,databaseName.globalData);
            });
          });


          // retrieve profile information about the distance
          request.get(params2, function (err, response, userDistance) {
            if (response.statusCode !== 200) {
              return err;
            }


            var i = 0;
            var activityDistanceToSave = [];
            while (i < userDistance['activities-distance'].length) {
              if (userDistance['activities-distance'][i].value > 0)
              {
                activityDistanceToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userDistance['activities-distance'][i].dateTime).getTime(),
                  distance: userDistance['activities-distance'][i].value,
                  nameActivity: 'distance',
                  source: 'fitbit-activity',
                  share: true

                });
              }
              i++;
            }

            storeActivity(activityDistanceToSave,username).then(function () {
              storeActivity(activityDistanceToSave,databaseName.globalData);
            });
          });

          // retrieve profile information about the elevation
          request.get(params3, function (err, response, userElevation) {
            if (response.statusCode !== 200) {
              return err;
            }

            var i = 0;
            var activityElevationToSave = [];
            while (i < userElevation['activities-elevation'].length) {
              if (userElevation['activities-elevation'][i].value > 0)
              {

                activityElevationToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userElevation['activities-elevation'][i].dateTime).getTime(),
                  elevation: userElevation['activities-elevation'][i].value,
                  nameActivity: 'elevation',
                  source: 'fitbit-activity',
                  share: true
                });
              }
              i++;
            }

            storeActivity(activityElevationToSave,username).then(function () {
              storeActivity(activityElevationToSave,databaseName.globalData);
            });
          });

          // retrieve profile information about the floors
          request.get(params4, function (err, response, userFloors) {
            if (response.statusCode !== 200) {
              return err;
            }

            var i = 0;
            var activityFloorsToSave = [];
            while (i < userFloors['activities-floors'].length)
            {
              if (userFloors['activities-floors'][i].value > 0)
              {
                activityFloorsToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userFloors['activities-floors'][i].dateTime).getTime(),
                  floors: userFloors['activities-floors'][i].value,
                  nameActivity: 'floors',
                  source: 'fitbit-activity',
                  share: true
                });
              }
              i++;
            }

            storeActivity(activityFloorsToSave,username).then(function () {
              storeActivity(activityFloorsToSave,databaseName.globalData);
            });
          });

          // retrieve profile information about the fairly
          request.get(params5, function (err, response, userFairly) {
            if (response.statusCode !== 200) {
              return err;
            }

            var i = 0;
            var activityFairlyToSave = [];
            while (i < userFairly['activities-minutesFairlyActive'].length) {
              if (userFairly['activities-minutesFairlyActive'][i].value > 0)
              {
                activityFairlyToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userFairly['activities-minutesFairlyActive'][i].dateTime).getTime(),
                  minutesFairlyActive: userFairly['activities-minutesFairlyActive'][i].value,
                  nameActivity: 'fairly',
                  source: 'fitbit-activity',
                  share: true
                });
              }
              i++;
            }

            storeActivity(activityFairlyToSave,username).then(function () {
              storeActivity(activityFairlyToSave,databaseName.globalData);
            });
          });

          // retrieve profile information about the lightly
          request.get(params6, function (err, response, userLightly) {
            if (response.statusCode !== 200) {
              return err;
            }

            var i = 0;
            var activityLightlyToSave = [];
            while (i < userLightly['activities-minutesLightlyActive'].length) {
              if (userLightly['activities-minutesLightlyActive'][i].value > 0)
              {
                activityLightlyToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userLightly['activities-minutesLightlyActive'][i].dateTime).getTime(),
                  minutesLightlyActive: userLightly['activities-minutesLightlyActive'][i].value,
                  nameActivity: 'minutesLightlyActive',
                  source: 'fitbit-activity',
                  share: true
                });
              }
              i++;
            }

            storeActivity(activityLightlyToSave,username).then(function () {
              storeActivity(activityLightlyToSave,databaseName.globalData);
            });
          });

          // retrieve profile information about the sedentary
          request.get(params7, function (err, response, userSedentary) {
            if (response.statusCode !== 200) {
              return err;
            }

            var i = 0;
            var activitySedentaryToSave = [];
            while (i < userSedentary['activities-minutesSedentary'].length) {
              if (userSedentary['activities-minutesSedentary'][i].value > 0)
              {
                activitySedentaryToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userSedentary['activities-minutesSedentary'][i].dateTime).getTime(),
                  minutesSedentary: userSedentary['activities-minutesSedentary'][i].value,
                  nameActivity: 'minutesSedentary',
                  source: 'fitbit-activity',
                  share: true
                });
              }
              i++;
            }

            storeActivity(activitySedentaryToSave,username).then(function () {
              storeActivity(activitySedentaryToSave,databaseName.globalData);
            });
          });

          // retrieve profile information about the steps
          request.get(params8, function (err, response, userSteps) {
            if (response.statusCode !== 200) {
              return err;
            }

            var i = 0;
            var activityStepsToSave = [];
            while (i < userSteps['activities-steps'].length) {
              if( userSteps['activities-steps'][i].value > 0)
              {
                activityStepsToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userSteps['activities-steps'][i].dateTime).getTime(),
                  steps: userSteps['activities-steps'][i].value,
                  nameActivity: 'steps',
                  source: 'fitbit-activity',
                  share: true
                });
              }
              i++;

            }
            storeActivity(activityStepsToSave,username).then(function () {
              storeActivity(activityStepsToSave,databaseName.globalData);
            });
          });

          // retrieve profile information about the very activy
          request.get(params9, function (err, response, userVery) {
            if (response.statusCode !== 200) {
              return err;
            }

            var i = 0;
            var activityVeryToSave = [];
            while (i < userVery['activities-minutesVeryActive'].length) {
              if( userVery['activities-minutesVeryActive'][i].value > 0)
              {
                activityVeryToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userVery['activities-minutesVeryActive'][i].dateTime).getTime(),
                  minutesVeryActive: userVery['activities-minutesVeryActive'][i].value,
                  nameActivity: 'veryActive',
                  source: 'fitbit-activity',
                  share: true

                });
              }
              i++;
            }

            storeActivity(activityVeryToSave,username).then(function () {
              storeActivity(activityVeryToSave,databaseName.globalData);
            });
          });

        }
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

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var fitbitConfig = profile.identities.configs.fitbitConfig;
        var params =
          {
            url: API_USER_BODY_AND_WEIGHT_DATA,
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        if (fitbitConfig.accessToken) {
          // true if it is the first time user requests fitbit profile
          var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
          var share = fitbitConfig.shareBodyWeight;


          // retrieve weight information about the current user
          request.get(params, function (err, response, userWeight) {
            if (response.statusCode !== 200) {
              return err;
            }

            if (firstRequest) {
              // share default value
              fitbitConfig.shareBodyWeight = true;
            }
            var i = 0;
            var weightToSave = [];
            while (i < userWeight['body-weight'].length) {
              if(userWeight['body-weight'][i].value > 0)
              {
                weightToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userWeight['body-weight'][i].dateTime).getTime(),
                  bodyWeight: userWeight['body-weight'][i].value,
                  source: 'fitbit-body',
                  nameBody: 'weight',
                  share: true
                });
              }
              i++;
            }

            storeBody(weightToSave, username).then(function () {
              storeBody(weightToSave, databaseName.globalData);
            });
          });
        }
      }
    });
  });
};


/**
 * Update the daily weight information.
 * @param username
 * @param callback
 */
var updateDailyWeight = function(username, callback, accessToken) {

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var fitbitConfig = profile.identities.configs.fitbitConfig;
        var params =
          {
            url: API_USER_DAILY_BODY_AND_WEIGHT_DATA,
            headers: {'Authorization': 'Bearer ' + accessToken},
            json: true
          };

        if (fitbitConfig.accessToken) {
          // true if it is the first time user requests fitbit profile
          var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
          var share = fitbitConfig.shareBodyWeight;

          console.log('FITBIT: Daily weight extraction:'+  new Date().toDateString());

          // retrieve weight information about the current user
          request.get(params, function (err, response, userWeight) {
            if (response.statusCode !== 200) {
              return err;
            }

            if (firstRequest) {
              // share default value
              fitbitConfig.shareBodyWeight = true;
            }
            var i = 0;
            var weightToSave = [];
            while (i < userWeight['body-weight'].length) {
              if(userWeight['body-weight'][i].value > 0)
              {
                weightToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userWeight['body-weight'][i].dateTime).getTime(),
                  bodyWeight: userWeight['body-weight'][i].value,
                  source: 'fitbit-body',
                  nameBody: 'weight',
                  share: true
                });
              }
              i++;
            }

            storeBody(weightToSave, username).then(function () {
              storeBody(weightToSave, databaseName.globalData);
            });
          });
        }
      }
    });
  });
};


/**
 * Update the user body and fat information.
 * @param username
 * @param callback
 */
var updateUserBodyFat = function(username, callback) {

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var fitbitConfig = profile.identities.configs.fitbitConfig;
        var params =
          {
            url: API_USER_BODY_AND_FAT_DATA,
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        if (fitbitConfig.accessToken) {
          // true if it is the first time user requests fitbit profile
          var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
          var share = fitbitConfig.shareBody_Fat;


          // retrieve fat information about the current user
          request.get(params, function (err, response, userFat) {
            if (response.statusCode !== 200) {
              return err;
            }

            if (firstRequest) {
              // share default value
              fitbitConfig.shareBody_Fat = true;
            }
            var i = 0;
            var fatToSave = [];
            while (i < userFat['body-fat'].length) {
              if(userFat['body-fat'][i].value > 0)
              {
                fatToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userFat['body-fat'][i].dateTime).getTime(),
                  bodyFat: userFat['body-fat'][i].value,
                  source: 'fitbit-body',
                  nameBody: 'fat',
                  share: true
                });
              }
              i++;
            }

            storeBody(fatToSave, username).then(function () {
              storeBody(fatToSave, databaseName.globalData);
            });
          });
        }
      }
    });
  });
};




/**
 * Update the daily fat information.
 * @param username
 * @param callback
 */
var updateDailyFat = function(username, callback, accessToken) {

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var fitbitConfig = profile.identities.configs.fitbitConfig;
        var params =
          {
            url: API_USER_DAILY_BODY_AND_FAT_DATA,
            headers: {'Authorization': 'Bearer ' + accessToken},
            json: true
          };

        if (fitbitConfig.accessToken) {
          // true if it is the first time user requests fitbit profile
          var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
          var share = fitbitConfig.shareBody_Fat;

          console.log('FITBIT: Daily fat extraction:'+  new Date().toDateString());

          // retrieve fat information about the current user
          request.get(params, function (err, response, userFat) {
            if (response.statusCode !== 200) {
              return err;
            }

            if (firstRequest) {
              // share default value
              fitbitConfig.shareBody_Fat = true;
            }
            var i = 0;
            var fatToSave = [];
            while (i < userFat['body-fat'].length) {
              if(userFat['body-fat'][i].value > 0)
              {
                fatToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userFat['body-fat'][i].dateTime).getTime(),
                  bodyFat: userFat['body-fat'][i].value,
                  source: 'fitbit-body',
                  nameBody: 'fat',
                  share: true
                });
              }
              i++;
            }

            storeBody(fatToSave, username).then(function () {
              storeBody(fatToSave, databaseName.globalData);
            });
          });
        }
      }
    });
  });
};



/**
 * Update the user body and BMI information.
 * @param username
 * @param callback
 */
var updateUserBodyBmi = function(username, callback) {

    var dbConnection = new CrowdPulse();
    return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
      return conn.Profile.findOne({username: username}, function (err, profile) {
        if (profile) {
          dbConnection.disconnect();

          var fitbitConfig = profile.identities.configs.fitbitConfig;
          var params =
            {
              url: API_USER_BODY_AND_BMI_DATA,
              headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
              json: true
            };

          if (fitbitConfig.accessToken) {
            // true if it is the first time user requests fitbit profile
            var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
            var share = fitbitConfig.shareBody_Bmi;


            // retrieve fat information about the current user
            request.get(params, function (err, response, userBmi) {
              if (response.statusCode !== 200) {
                return err;
              }

              if (firstRequest) {
                // share default value
                fitbitConfig.shareBody_Bmi = true;
              }
              var i = 0;
              var bmiToSave = [];
              while (i < userBmi['body-bmi'].length) {
                if(userBmi['body-bmi'][i].value > 0)
                {
                  bmiToSave.push({
                    deviceId: 'fitbit',
                    username: username,
                    timestamp: new Date(userBmi['body-bmi'][i].dateTime).getTime(),
                    bodyBmi: userBmi['body-bmi'][i].value,
                    source: 'fitbit-body',
                    nameBody: 'BMI',
                    share: true
                  });
                }
                i++;
              }

              storeBody(bmiToSave, username).then(function () {
                storeBody(bmiToSave, databaseName.globalData);
              });
            });
          }
        }
      });
    });
  };




/**
 * Update the daily BMI information.
 * @param username
 * @param callback
 */
var updateDailyBmi = function(username, callback, accessToken) {

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var fitbitConfig = profile.identities.configs.fitbitConfig;
        var params =
          {
            url: API_USER_DAILY_BODY_AND_BMI_DATA,
            headers: {'Authorization': 'Bearer ' + accessToken},
            json: true
          };

        if (fitbitConfig.accessToken) {
          // true if it is the first time user requests fitbit profile
          var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
          var share = fitbitConfig.shareBody_Bmi;

          console.log('FITBIT: Daily BMI extraction:'+  new Date().toDateString());

          // retrieve fat information about the current user
          request.get(params, function (err, response, userBmi) {
            if (response.statusCode !== 200) {
              return err;
            }

            if (firstRequest) {
              // share default value
              fitbitConfig.shareBody_Bmi = true;
            }
            var i = 0;
            var bmiToSave = [];
            while (i < userBmi['body-bmi'].length) {
              if(userBmi['body-bmi'][i].value > 0)
              {
                bmiToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userBmi['body-bmi'][i].dateTime).getTime(),
                  bodyBmi: userBmi['body-bmi'][i].value,
                  source: 'fitbit-body',
                  nameBody: 'BMI',
                  share: true
                });
              }
              i++;
            }

            storeBody(bmiToSave, username).then(function () {
              storeBody(bmiToSave, databaseName.globalData);
            });
          });
        }
      }
    });
  });
};



/**
 * Update the user  food information.
 * @param username
 * @param callback
 */
var updateUserFood = function(username, callback) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var fitbitConfig = profile.identities.configs.fitbitConfig;

        var params =
          {
            url: API_USER_FOOD_DATA,
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        if (fitbitConfig.accessToken) {
          // true if it is the first time user requests fitbit profile
          var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
          var share = fitbitConfig.shareFood;

          // retrieve profile information about the current user
          request.get(params, function (err, response, userFood) {
            if (response.statusCode !== 200) {
              return err;
            }

            if (firstRequest) {
              // share default value
              fitbitConfig.shareFood = true;
            }

            var i = 0;
            var foodToSave = [];
            while (i < userFood['foods-log-caloriesIn'].length) {
              if(userFood['foods-log-caloriesIn'][i].value > 0)
              {
                foodToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userFood['foods-log-caloriesIn'][i].dateTime).getTime(),
                  caloriesIn: userFood['foods-log-caloriesIn'][i].value,
                  source: 'fitbit-food',
                  share: true
                });
              }
              i++;
            }

            storeFood(foodToSave, username).then(function () {
              storeFood(foodToSave, databaseName.globalData);
            });
          });
        }
      }
    });
  });
};



/**
 * Update the user daily food information.
 * @param username
 * @param callback
 */
var updateDailyFood = function(username, callback, accessToken) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var fitbitConfig = profile.identities.configs.fitbitConfig;

        var params =
          {
            url: API_USER_DAILY_FOOD_DATA,
            headers: {'Authorization': 'Bearer ' + accessToken},
            json: true
          };

        if (fitbitConfig.accessToken) {
          // true if it is the first time user requests fitbit profile
          var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
          var share = fitbitConfig.shareFood;

          console.log('FITBIT: Daily food extraction:'+  new Date().toDateString());

          // retrieve profile information about the current user
          request.get(params, function (err, response, userFood) {
            if (response.statusCode !== 200) {
              return err;
            }

            if (firstRequest) {
              // share default value
              fitbitConfig.shareFood = true;
            }

            var i = 0;
            var foodToSave = [];
            while (i < userFood['foods-log-caloriesIn'].length) {
              if(userFood['foods-log-caloriesIn'][i].value > 0)
              {
                foodToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userFood['foods-log-caloriesIn'][i].dateTime).getTime(),
                  caloriesIn: userFood['foods-log-caloriesIn'][i].value,
                  source: 'fitbit-food',
                  share: true
                });
              }
              i++;
            }

            storeFood(foodToSave, username).then(function () {
              storeFood(foodToSave, databaseName.globalData);
            });
          });
        }
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
              username: username,
              contactId: userFriends.friends[i].user.encodedId,
              contactName: userFriends.friends[i].user.displayName,
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
 * Update the user friends information.
 * @param username
 * @param callback
 */
var updateDailyFriends = function(username, callback, accessToken) {

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      var fitbitConfig = profile.identities.configs.fitbitConfig;

      var params =
        {
          url: API_USER_FRIENDS_DATA,
          headers: { 'Authorization': 'Bearer ' + accessToken },
          json: true
        };

      if (fitbitConfig.accessToken) {
        // true if it is the first time user requests fitbit profile
        var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
        var share = fitbitConfig.shareFriends;

        console.log('FITBIT: Daily friends extraction:'+  new Date().toDateString());

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
              username: username,
              contactId: userFriends.friends[i].user.encodedId,
              contactName: userFriends.friends[i].user.displayName,
              share: true
            });
            i++;
          }

          // return the friends
          var dbConnection = new CrowdPulse();
          return dbConnection.connect(config.database.url, username).then(function (conn) {
            return conn.Connection.find({contactName: {$not: userFriends.friends[0].user.displayName}});
          }).then(function (friends) {
            dbConnection.disconnect();
            storeFriends(friendsToSave, username).then(function () {
            storeFriends(friendsToSave, databaseName.globalData);

          });
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

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var fitbitConfig = profile.identities.configs.fitbitConfig;

        var params =
          {
            url: API_USER_HEARTRATE_DATA,
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        if (fitbitConfig.accessToken) {
          // true if it is the first time user requests fitbit profile
          var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
          var share = fitbitConfig.shareHeartRate;


          // retrieve profile information about the current user
          request.get(params, function (err, response, userHeart) {
            if (response.statusCode !== 200) {
              return err;
            }

            if (firstRequest) {
              // share default value
              fitbitConfig.shareHeartRate = true;
            }

            var i = 0;
            var heartToSave = [];
            while (i < userHeart['activities-heart'].length) {
              if(userHeart['activities-heart'][i].value.restingHeartRate > 0)
              {
                heartToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userHeart['activities-heart'][i].dateTime).getTime(),
                  restingHeartRate: userHeart['activities-heart'][i].value.restingHeartRate,
                  outOfRange_minutes: userHeart['activities-heart'][i].value.heartRateZones[0].minutes,
                  fatBurn_minutes: userHeart['activities-heart'][i].value.heartRateZones[1].minutes,
                  cardio_minutes: userHeart['activities-heart'][i].value.heartRateZones[2].minutes,
                  peak_minutes: userHeart['activities-heart'][i].value.heartRateZones[3].minutes,
                  source: 'fitbit-heart',
                  share: true
                });
              }
              i++;
            }

            storeHeart(heartToSave, username).then(function () {
              storeHeart(heartToSave, databaseName.globalData);
            });
          });
        }
      }
    });
  });
};



/**
 * Update the user daily heart rate information.
 * @param username
 * @param callback
 */
var updateDailyHeartRate = function(username, callback, accessToken) {

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var fitbitConfig = profile.identities.configs.fitbitConfig;

        var params =
          {
            url: API_USER_DAILY_HEARTRATE_DATA,
            headers: {'Authorization': 'Bearer ' + accessToken},
            json: true
          };

        if (fitbitConfig.accessToken) {
          // true if it is the first time user requests fitbit profile
          var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
          var share = fitbitConfig.shareHeartRate;

          console.log('FITBIT: Daily heart extraction:'+  new Date().toDateString());

          // retrieve profile information about the current user
          request.get(params, function (err, response, userHeart) {
            if (response.statusCode !== 200) {
              return err;
            }

            if (firstRequest) {
              // share default value
              fitbitConfig.shareHeartRate = true;
            }

            var i = 0;
            var heartToSave = [];
            while (i < userHeart['activities-heart'].length) {
              if(userHeart['activities-heart'][i].value.restingHeartRate > 0)
              {
                heartToSave.push({
                  deviceId: 'fitbit',
                  username: username,
                  timestamp: new Date(userHeart['activities-heart'][i].dateTime).getTime(),
                  restingHeartRate: userHeart['activities-heart'][i].value.restingHeartRate,
                  outOfRange_minutes: userHeart['activities-heart'][i].value.heartRateZones[0].minutes,
                  fatBurn_minutes: userHeart['activities-heart'][i].value.heartRateZones[1].minutes,
                  cardio_minutes: userHeart['activities-heart'][i].value.heartRateZones[2].minutes,
                  peak_minutes: userHeart['activities-heart'][i].value.heartRateZones[3].minutes,
                  source: 'fitbit-heart',
                  share: true
                });
              }
              i++;
            }

            storeHeart(heartToSave, username).then(function () {
              storeHeart(heartToSave, databaseName.globalData);
            });
          });
        }
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
        //setting data
        var dataodierna = new Date();
        var data = new Date();
        data.setMonth(data.getMonth()-3);

        var params =
          {
            url: API_USER_SLEEP_DATA + data.toISOString().substring(0,10)+'/'+dataodierna.toISOString().substring(0,10)+'.json',
            headers: {'Authorization': 'Bearer ' + fitbitConfig.accessToken},
            json: true
          };

        if (fitbitConfig.accessToken) {
          // true if it is the first time user requests fitbit profile
          var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
          var share = fitbitConfig.shareSleep;


          // retrieve profile information about the current user
          request.get(params, function (err, response, userSleep) {
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
              if(userSleep.sleep[i].duration > 0)
              {
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
              }
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
 * Update daily user sleep information.
 * @param username
 * @param callback
 */
var updateDailySleep = function(username, callback, accessToken) {

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var fitbitConfig = profile.identities.configs.fitbitConfig;
        //setting data
        var dataodierna = new Date();

        var params =
          {
            url: API_USER_SLEEP_DATA + dataodierna.toISOString().substring(0,10)+'.json',
            headers: {'Authorization': 'Bearer ' + accessToken},
            json: true
          };

        if (fitbitConfig.accessToken) {
          // true if it is the first time user requests fitbit profile
          var firstRequest = !profile.identities.configs.fitbitConfig.fitbitId;
          var share = fitbitConfig.shareSleep;

          console.log('FITBIT: Daily sleep extraction:'+  new Date().toDateString());

          // retrieve profile information about the current user
          request.get(params, function (err, response, userSleep) {
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
              if(userSleep.sleep[i].duration > 0)
              {
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
              }
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
 * Store body in the MongoDB database
 * @param body
 * @param databaseName
 */
var storeBody = function(bodys, databaseName) {

  var dbConnection = new CrowdPulse();
  var bodySaved = 0;
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    if (bodys.length <= 0) {
      return dbConnection.disconnect();
    }
    bodys.forEach(function (body) {

      return conn.PersonalData.newFromObject(body).save().then(function () {
        bodySaved++;

        if (bodySaved >= bodys.length) {
          console.log(bodys.length + " body from Fitbit saved in " + databaseName + " at " + new Date());
          return dbConnection.disconnect();
        }
      });
    });
  });
};


/**
 * Store sleep in the MongoDB database
 * @param sleep
 * @param databaseName
 */
var storeSleep = function(sleeps, databaseName) {

  var dbConnection = new CrowdPulse();
  var sleepSaved = 0;
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    if (sleeps.length <= 0) {
      return dbConnection.disconnect();
    }
    sleeps.forEach(function (sleep) {

      return conn.PersonalData.newFromObject(sleep).save().then(function () {
        sleepSaved++;

        if (sleepSaved >= sleeps.length) {
          console.log(sleeps.length + " sleeps from Fitbit saved in " + databaseName + " at " + new Date());
          return dbConnection.disconnect();
        }
      });
    });
  });
};



/**
 * Store heart rate in the MongoDB database
 * @param hearts
 * @param databaseName
 */
var storeHeart = function(hearts, databaseName) {

  var dbConnection = new CrowdPulse();
  var heartSaved = 0;
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    if (hearts.length <= 0) {
      return dbConnection.disconnect();
    }
    hearts.forEach(function (heart) {

      return conn.PersonalData.newFromObject(heart).save().then(function () {
        heartSaved++;

        if (heartSaved >= hearts.length) {
          console.log(hearts.length + " hearts from Fitbit saved in " + databaseName + " at " + new Date());
          return dbConnection.disconnect();
        }
      });
    });
  });
};



/**
 * Store foods in the MongoDB database
 * @param foods
 * @param databaseName
 */
var storeFood = function(foods, databaseName) {

  var dbConnection = new CrowdPulse();
  var foodSaved = 0;
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    if (foods.length <= 0) {
      return dbConnection.disconnect();
    }
    foods.forEach(function (food) {

      return conn.PersonalData.newFromObject(food).save().then(function () {
        foodSaved++;

        if (foodSaved >= foods.length) {
          console.log(foods.length + " foods from Fitbit saved in " + databaseName + " at " + new Date());
          return dbConnection.disconnect();
        }
      });
    });
  });
};


/**
 * Store sleep in the MongoDB database
 * @param activities
 * @param databaseName
 */
var storeActivity = function(activities, databaseName) {
  var dbConnection = new CrowdPulse();
  var activitySaved = 0;
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {

    if (activities.length <= 0) {
      return dbConnection.disconnect();
    }

    activities.forEach(function (activity) {

      return conn.PersonalData.newFromObject(activity).save().then(function () {
        activitySaved++;

        if (activitySaved >= activities.length) {
          console.log(activities.length + " activities from Fitbit saved in " + databaseName + " at " + new Date());
          return dbConnection.disconnect();
        }
      });
    });
  });
};



/**
 * Delete body stored in the MongoDB database
 * @param username
 * @param databaseName
 */
var deleteBody = function(username, databaseName) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    return conn.PersonalData.deleteMany({username: username, source: /fitbit-body.*/}, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Fitbit body deleted from " + databaseName + " at " + new Date());
      }
      return dbConnection.disconnect();
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
    return conn.PersonalData.deleteMany({username: username, source: /fitbit-sleep.*/}, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Fitbit sleep deleted from " + databaseName + " at " + new Date());
      }
      return dbConnection.disconnect();
    });
  });
};


/**
 * Delete sleep stored in the MongoDB database
 * @param username
 * @param databaseName
 */
var deleteActivity = function(username, databaseName) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    return conn.PersonalData.deleteMany({username: username, source: /fitbit-activity.*/}, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Fitbit activity deleted from " + databaseName + " at " + new Date());
      }
      return dbConnection.disconnect();
    });
  });
};



/**
 * Delete heart stored in the MongoDB database
 * @param username
 * @param databaseName
 */
var deleteHeart = function(username, databaseName) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    return conn.PersonalData.deleteMany({username: username, source: /fitbit-heart.*/}, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Fitbit heart rate deleted from " + databaseName + " at " + new Date());
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


/**
 * Delete foods stored in the MongoDB database
 * @param username
 * @param databaseName
 */
var deleteFood = function(username, databaseName) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    return conn.PersonalData.deleteMany({username: username, source: /fitbit-food.*/}, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Fitbit food deleted from " + databaseName + " at " + new Date());
      }
      return dbConnection.disconnect();
    });
  });
};


var updateToken = function(user, callback) {

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: user}, function (err, profile) {

      var params = {
        url: API_ACCESS_TOKEN,
        form: {
          grant_type: 'refresh_token',
          refresh_token :  profile.identities.configs.fitbitConfig.refreshToken,
          expires_in : 28800
        },
        headers: {
          'Authorization': 'Basic ' + (new Buffer(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
        },
        json: true
      };

      request.post(params, function(err, response, refreshToken){

        console.log('Old access token: ' + user);
        console.log(profile.identities.configs.fitbitConfig.accessToken);

        if (response.statusCode !== 200 || err) {

          console.log('Error refresh token 1');

        } else {

          // save access token in the database
          if (profile) {

            profile.identities.configs.fitbitConfig = {
              accessToken: refreshToken.access_token,
              refreshToken: refreshToken.refresh_token,
              expiresIn: refreshToken.expires_in
            };

            profile.save();
            console.log('New access token: ' + user + new Date().toDateString());
            console.log(profile.identities.configs.fitbitConfig.accessToken);
            setTimeout(function(){updateUserProfile(user, null)}, 9000);
            setTimeout(function(){updateDailyFriends(user, null,refreshToken.access_token)}, 9000);
            setTimeout(function(){updateDailyFood(user, null, refreshToken.access_token)}, 9000);
            setTimeout(function(){updateDailySleep(user, null, refreshToken.access_token)}, 9000);
            setTimeout(function(){updateDailyActivity(user, null, refreshToken.access_token)}, 9000);
            setTimeout(function(){updateDailyHeartRate(user, null, refreshToken.access_token)}, 9000);
            setTimeout(function(){updateDailyWeight(user, null, refreshToken.access_token)}, 9000);
            setTimeout(function(){updateDailyFat(user, null, refreshToken.access_token)}, 9000);
            setTimeout(function(){updateDailyBmi(user, null, refreshToken.access_token)}, 9000);

          } else {
            console.log('Error save token 2');
          }
        }
      });
    });
  }).then(function () {
    setTimeout(function(){dbConnection.disconnect()}, 30000);
  });
  };



exports.updateUserProfile = updateUserProfile;
exports.updateUserActivity = updateUserActivity;
exports.updateUserBodyWeight = updateUserBodyWeight;
exports.updateUserBodyFat = updateUserBodyFat;
exports.updateUserBodyBmi = updateUserBodyBmi;
exports.updateUserFood = updateUserFood;
exports.updateUserFriends = updateUserFriends;
exports.updateUserHeartRate = updateUserHeartRate;
exports.updateUserSleep = updateUserSleep;
exports.updateDailySleep = updateDailySleep;
exports.updateDailyActivity = updateDailyActivity;
exports.updateDailyHeartRate = updateDailyHeartRate;
exports.updateDailyFriends = updateDailyFriends;
exports.updateDailyFood = updateDailyFood;
exports.updateDailyWeight = updateDailyWeight;
exports.updateDailyFat = updateDailyFat;
exports.updateDailyBmi = updateDailyBmi;
exports.updateToken = updateToken;