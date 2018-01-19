'use strict';

var router = require('express').Router();
var request = require('request');
var Q = require('q');
var qs = require('querystring');
var CrowdPulse = require('./../crowd-pulse-data');
var databaseName = require('./../crowd-pulse-data/databaseName');
var config = require('./../lib/config');
var TwitterProfileSchema = require('./../crowd-pulse-data/schema/twitterProfile');

const DB_PROFILES = databaseName.profiles;
const DB_GLOBAL_DATA = databaseName.globalData;

const CONSUMER_KEY = 'UwKgjmP3nkgswMi18fFRMO5Kc';
const CONSUMER_SECRET = 'gJ0NEoKovmNum8AXb9zstwYCcdU8WqUK0GnTrWx9kXWeFYSCAX';

const API_REQUEST_TOKEN = 'https://api.twitter.com/oauth/request_token';
const API_ACCESS_TOKEN = 'https://api.twitter.com/oauth/access_token';
const API_AUTHENTICATION = 'https://api.twitter.com/oauth/authenticate';
const API_TIMELINE = 'https://api.twitter.com/1.1/statuses/user_timeline.json';
const API_PROFILE = 'https://api.twitter.com/1.1/users/show.json';

exports.endpoint = function() {

  /**
   * Obtain a request token.
   * Params:
   *    callbackUrl - the url send to Twitter as callback
   */
  router.route('/twitter/request_token')
    .post(function (req, res) {
      try {
        var oauth = {
          consumer_key: CONSUMER_KEY,
          consumer_secret: CONSUMER_SECRET,
          callback: req.body.callback
        };
        request.post({url: API_REQUEST_TOKEN, oauth: oauth}, function (error, response, body) {
          var authData = qs.parse(body);
          var url = API_AUTHENTICATION + '?' + qs.stringify({oauth_token: authData.oauth_token});
          if (authData.oauth_callback_confirmed === 'true') {
            res.status(200);
            res.json({
              auth: true,
              redirectUrl: url
            });
          } else {
            res.sendStatus(500);
          }
        });
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });

  /**
   * Render the request token into a usable access token.
   * Params:
   *    oauthToken - obtained after the user authentication
   *    oauthVerifier - obtained after the user authentication
   */
  router.route('/twitter/access_token')
    .post(function (req, res) {
      try {
        var oauth = {
          consumer_key: CONSUMER_KEY,
          consumer_secret: CONSUMER_SECRET,
          token: req.body.oauthToken,
          verifier: req.body.oauthVerifier
        };
        request.post({url: API_ACCESS_TOKEN, oauth: oauth}, function (error, response, body) {
          var oauthData = qs.parse(body);

          // save oauthData in the database
          var dbConnection = new CrowdPulse();
          return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
            return conn.Profile.findOne({username: req.session.username}, function (err, profile) {
              if (profile) {
                profile.identities.configs.twitterConfig = {
                  twitterId: oauthData.user_id,
                  oauthToken: oauthData.oauth_token,
                  oauthTokenSecret: oauthData.oauth_token_secret
                };
                profile.identities.twitter.screen_name =  oauthData.screen_name;
                profile.save();
              }
              res.status(200);
              res.json({auth: true});
            });
          }).then(function () {
            dbConnection.disconnect();
          });
        });

      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });

  /**
   * Get Twitter user profile information.
   */
  router.route('/twitter/profile')
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
   * Gets the user timeline.
   * Params:
   *    messages - the number of messages to retrieve
   */
  router.route('/twitter/user_timeline')
    .post(function (req, res) {
      try {
        var messagesToRead = req.body.messages;

        // if the client do not specify a messages to read number then update the user messages
        if (!messagesToRead) {
          updateTweets(req.session.username).then(function () {
            res.status(200);
            res.json({auth: true});
          });
        } else {

          // return the messages
          var dbConnection = new CrowdPulse();
          return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
            return conn.Message.find({source: /twitter_.*/}).sort({date: -1}).limit(messagesToRead);
          }).then(function (messages) {
            dbConnection.disconnect();
            res.status(200);
            res.json({auth: true, messages: messages});
          });
        }
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });


  /**
   * Delete Twitter information account, including tweets.
   */
  router.route('/twitter/delete')
    .delete(function (req, res) {
      try {
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
          return conn.Profile.findOne({username: req.session.username}, function (err, profile) {
            if (profile) {

              var twitterUsername = profile.identities.twitter.screen_name;
              deleteMessages(twitterUsername, req.session.username);
              deleteMessages(twitterUsername, DB_GLOBAL_DATA);

              profile.identities.twitter = undefined;
              profile.identities.configs.twitterConfig = undefined;
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

  // twitter oauth data
  var oauth = {
    consumer_key: CONSUMER_KEY,
    consumer_secret: CONSUMER_SECRET,
    token: null,
    token_secret: null
  };

  // api parameters
  var params = {
    screen_name: null,
    user_id: null
  };

  // get oauth data from database
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username});
  }).then(function (profile) {
    if (profile) {
      oauth.token = profile.identities.configs.twitterConfig.oauthToken;
      oauth.token_secret = profile.identities.configs.twitterConfig.oauthTokenSecret;
      params.userId = profile.identities.configs.twitterConfig.twitterId;
      params.screen_name = profile.identities.twitter.screen_name;

      request.get({url:API_PROFILE, oauth:oauth, qs:params, json:true}, function (err, response, userData) {
        if (err) {
          return err;
        }

        // save the Twitter user ID
        profile.identities.twitter.twitterId = userData.id;

        // save other returned data
        for (var key in TwitterProfileSchema) {
          if (TwitterProfileSchema.hasOwnProperty(key) && userData[key]) {
            profile.identities.twitter[key] = userData[key];
          }
        }

        // change profile picture
        if (userData.profile_image_url) {
          profile.identities.twitter.profile_image_url = userData.profile_image_url.replace('_normal', '');
          profile.pictureUrl = profile.identities.twitter.profile_image_url;
        }

        // save profile in the DB
        profile.save().then(function () {
          dbConnection.disconnect();
        });

        callback(profile);
      });
    }
  });
};

/**
 * Update the user tweets.
 * @param username
 */
var updateTweets = function (username) {

  // twitter oauth data
  var oauth = {
    consumer_key: CONSUMER_KEY,
    consumer_secret: CONSUMER_SECRET,
    token: null,
    token_secret: null
  };

  var params = {
    since_id: null,
    count: 200
  };

  // get oauth data from database
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username});
  }).then(function (profile) {
    if (profile) {
      dbConnection.disconnect();

      var twitterConfig = profile.identities.configs.twitterConfig;
      oauth.token = twitterConfig.oauthToken;
      oauth.token_secret = twitterConfig.oauthTokenSecret;
      params.since_id = twitterConfig.lastTweetId;

      // request timeline
      request.get({url: API_TIMELINE, oauth: oauth, qs: params, json: true}, function (error, response, tweets) {
        if (tweets && tweets.length > 0) {
          var messages = [];
          tweets.forEach(function (tweet) {
            messages.push({
              oId: tweet.id_str,
              text: tweet.text,
              source: 'twitter_' + tweet.user.id,
              fromUser: tweet.user.screen_name,
              date: new Date(tweet.created_at),
              language: tweet.lang,
              favs: tweet.favorite_count,
              shares: tweet.shares_count
            });
          });

          storeMessages(messages, DB_GLOBAL_DATA).then(function () {
            storeMessages(messages, username).then(function () {
              if (messages[0]) {

                // create new db connection to save last tweet id in the user profile config
                dbConnection = new CrowdPulse();
                return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
                  return conn.Profile.findOne({username: username}, function (err, profile) {
                    if (profile) {
                      profile.identities.configs.twitterConfig.lastTweetId = messages[0].oId;
                      profile.save().then(function () {
                        dbConnection.disconnect();
                      });
                    }
                  });
                });
              }
            });
          });
        }
      });
    }
  });
};

/**
 * Store messages in the MongoDB database
 * @param messages
 * @param databaseName
 */
var storeMessages = function(messages, databaseName) {
  var dbConnection = new CrowdPulse();
  var messagesSaved = 0;
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    messages.forEach(function (message) {
      return conn.Message.newFromObject(message).save().then(function () {
        messagesSaved++;
        if (messagesSaved >= messages.length) {
          console.log(messages.length + " messages from Twitter saved in " + databaseName + " at " + new Date());
          return dbConnection.disconnect();
        }
      });
    });
  });
};

/**
 * Delete messages stored in the MongoDB database
 * @param username
 * @param databaseName
 */
var deleteMessages = function(username, databaseName) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    return conn.Message.deleteMany({fromUser: username, source: /twitter.*/}, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Twitter messages deleted from " + databaseName + " at " + new Date());
      }
      return dbConnection.disconnect();
    });
  });
};

exports.updateUserProfile = updateUserProfile;
exports.updateTweets = updateTweets;