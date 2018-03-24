'use strict';

var router = require('express').Router();
var request = require('request');
var qs = require('querystring');
var CrowdPulse = require('./../crowd-pulse-data');
var databaseName = require('./../crowd-pulse-data/databaseName');
var config = require('./../lib/config');
var InstagramProfileSchema = require('./../crowd-pulse-data/schema/instagramProfile');
var batch = require('./../lib/batchOperations');

const DB_PROFILES = databaseName.profiles;
const CLIENT_SECRET = 'd9c64de8ca4e4c70b87c8e3b3509b176';
const CLIENT_ID = '152debe8eda845d28529bedf9bce9ecb';

const API_ACCESS_TOKEN = 'https://api.instagram.com/oauth/access_token';
const API_LOGIN_DIALOG = 'https://api.instagram.com/oauth/authorize/';
const API_USER_POSTS = 'https://api.instagram.com/v1/users/self/media/recent/';
const GRANT = 'authorization_code';

exports.endpoint = function() {

  /**
   * Creates a login dialog URL.
   * Params:
   *    callbackUrl - the url send to Instagram as callback
   */
  router.route('/instagram/login_dialog')
    .post(function (req, res) {
      try {
        var params = {
          client_id: CLIENT_ID,
          redirect_uri: req.body.callbackUrl,
          response_type: 'code'
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
   *    code - the authorization code returned by Instagram after user login
   *    callbackUrl - the url send to Instagram as callback
   */
  router.route('/instagram/request_token')
    .post(function (req, res) {
      try {
        var params = {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: GRANT,
          redirect_uri: req.body.callbackUrl,
          code: req.body.code
        };

        request.post({url:API_ACCESS_TOKEN, form: params}, function(err, response, oauthData) {
          // console.log(response);
          if (response.statusCode !== 200 || err) {
            res.sendStatus(500);
          } else {

            // save access token in the database
            var dbConnection = new CrowdPulse();
            return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
              return conn.Profile.findOne({username: req.session.username}, function (err, profile) {
                if (profile) {
                  var parsed = JSON.parse(oauthData);
                  profile.identities.configs.instagramConfig = {
                    accessToken: parsed.access_token
                    //expiresIn: oauthData.expires_in
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
   * Get Instagram user profile information.
   */
  router.route('/instagram/profile')
    .get(function (req, res) {
      try {
        updateUserProfile(req.session.username, function (profile) {
          if (profile) {
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
   * Update Instagram configuration reading parameters from query.
   */
  router.route('/instagram/config')
    .get(function (req, res) {
      try {
        var params = req.query;
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
          return conn.Profile.findOne({username: req.session.username}, function (err, user) {
            if (user) {

              if (params.shareProfile !== null && params.shareProfile !== undefined) {
                user.identities.configs.instagramConfig.shareProfile = params.shareProfile;
              }

              if (params.shareMessages !== null && params.shareMessages !== undefined) {
                user.identities.configs.instagramConfig.shareMessages = params.shareMessages;
                updateShareMessages(user.identities.configs.instagramConfig.instagramkId, req.session.username, params.shareMessages);
                updateShareMessages(user.identities.configs.instagramkConfig.instagramkId, databaseName.globalData, params.shareMessages);
              }

              if (params.shareFriends !== null && params.shareFriends !== undefined) {
                user.identities.configs.instagramConfig.shareFriends = params.shareFriends;
                updateShareFriends(req.session.username, req.session.username, params.shareFriends);
                updateShareFriends(req.session.username, databaseName.globalData, params.shareFriends);
              }

              if (params.shareLikes !== null && params.shareLikes !== undefined) {
                user.identities.configs.instagramConfig.shareLikes = params.shareLikes;
                updateShareLikes(user.identities.configs.instagramConfig.instagramId, req.session.username, params.shareLikes);
                updateShareLikes(user.identities.configs.instagramConfig.instagramId, databaseName.globalData, params.shareLikes);
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
   * Get Instagram user posts.
   * Params:
   *    messages - the number of messages to retrieve
   */
  router.route('/instagram/posts')
    .post(function (req, res) {
      try {
        var messagesToRead = req.body.messages;

        // if the client do not specify a messages number to read then update the user messages
        if (!messagesToRead) {
          updatePosts(req.session.username).then(function () {
            res.status(200);
            res.json({auth: true});
          });
        } else {

          // return the messages
          var dbConnection = new CrowdPulse();
          return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
            return conn.Message.find({source: /instagram_.*/}).sort({date: -1}).limit(messagesToRead);
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
   * Delete Instagram information account, including posts and likes.
   */
  router.route('/instagram/delete')
    .delete(function (req, res) {
      try {
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
          return conn.Profile.findOne({username: req.session.username}, function (err, profile) {
            if (profile) {

              var instagramId = profile.identities.instagram.instagramId;
              deleteMessages(instagramId, req.session.username);
              deleteMessages(instagramId, databaseName.globalData);
              deleteLikes(instagramId, req.session.username);
              deleteLikes(instagramId, databaseName.globalData);
              deleteFriends(req.session.username, req.session.username);
              deleteFriends(req.session.username, databaseName.globalData);

              profile.identities.instagram = undefined;
              profile.identities.configs.instagramConfig = undefined;
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
  if (!callback) {
    callback = function () {}
  }

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      var instagramConfig = profile.identities.configs.instagramConfig;
      var params = {
        access_token: instagramConfig.accessToken
      };
      if (params.access_token) {

        // true if it is the first time user requests instagram profile
        var firstRequest = !profile.identities.configs.instagramConfig.instagramId;

        // retrieve profile information about the current user
        request.get({ url: API_USER_DATA, qs: params, json: true }, function(err, response, userData) {

          if (response.statusCode !== 200) {
            return err;
          }

          // save the Instagram user ID
          profile.identities.instagram.instagramId = userData.id;
          profile.identities.configs.instagramConfig.instagramId = userData.id;

          if (firstRequest) {

            // share default value
            instagramConfig.shareMessages = true;
            instagramConfig.shareProfile = true;
          }

          // save other Instagram data
          for (var key in InstagramProfileSchema) {
            if (InstagramProfileSchema.hasOwnProperty(key) && userData[key]) {
              profile.identities.instagram[key] = userData[key];
            }
          }

          // save languages as array string
          if (userData.languages) {
            var langs = [];
            userData.languages.forEach(function (lang) {
              langs.push(lang.name)
            });
            profile.identities.instagram.languages = langs;
          }

          // save picture url
          if (userData.id) {
            profile.identities.instagram.picture = 'https://graph.facebook.com/v2.3/' + userData.id + '/picture?type=large';
          }

          // change profile picture
          if (profile.identities.facebook.picture) {
            profile.pictureUrl = profile.identities.facebook.picture;
          }

          profile.save().then(function () {
            console.log("Instagram profile of " + username + " updated at " + new Date());
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
 * Update user posts.
 * @param username
 */
var updatePosts = function(username) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var facebookConfig = profile.identities.configs.facebookConfig;
        var params = {
          access_token: facebookConfig.accessToken,
          since: facebookConfig.lastPostId,
          limit: 1000
        };

        var share = facebookConfig.shareMessages;

        // retrieve posts of the current user
        request.get({ url: API_USER_POSTS, qs: params, json: true }, function(err, response, posts) {

          if (response.statusCode !== 200) {
            return err;
          }

          var messages = [];
          posts.data.forEach(function (post) {
            var toUsers = null;
            if (post.to) {
              toUsers = post.to.map(function (users) {
                return users.name;
              });
            }
            messages.push({
              oId: post.id,
              text: post.message || '',
              source: 'facebook_' + facebookConfig.facebookId,
              fromUser: facebookConfig.facebookId,
              date: new Date(post.created_time),
              story: post.story,
              shares: post.shares,
              toUsers: toUsers,
              share: share
            });
          });

          storeMessages(messages, username).then(function () {
            storeMessages(messages, databaseName.globalData).then(function () {

              // if new messages are saved
              if (messages.length > 0) {

                // create new db connection to save last post timestamp in the user profile config
                dbConnection = new CrowdPulse();
                dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
                  conn.Profile.findOne({username: username}, function (err, profile) {
                    if (profile) {
                      profile.identities.configs.facebookConfig.lastPostId = messages[0].date.getTime() / 1000;
                      profile.save().then(function () {
                        dbConnection.disconnect();
                      });
                    }
                  });
                });

                // run CrowdPulse
                var projects = config['crowd-pulse'].projects;
                if (projects && projects.length > 0) {

                  // loop projects with a delay between each run
                  (function loopWithDelay(i) {
                    setTimeout(function () {
                      batch.runCrowdPulse(projects[i], username);

                      if (i--) {
                        loopWithDelay(i);
                      }
                    }, 60000);
                  })(projects.length - 1);
                }

              }
            });
          });
        });
      }
    });
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
    if (messages.length <= 0) {
      return dbConnection.disconnect();
    }
    messages.forEach(function (message) {
      return conn.Message.newFromObject(message).save().then(function () {
        messagesSaved++;
        if (messagesSaved >= messages.length) {
          console.log(messages.length + " messages from Instagram saved in " + databaseName + " at " + new Date());
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
    return conn.Message.deleteMany({fromUser: username, source: /facebook.*/}, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Instagram posts deleted from " + databaseName + " at " + new Date());
      }
      return dbConnection.disconnect();
    });
  });
};

/**
 * Update share option for messages.
 * @param userId
 * @param databaseName
 * @param share
 */
var updateShareMessages = function (userId, databaseName, share) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    return conn.Message.update({source: 'instagram_' + userId}, {$set: {share: share}}, {multi: true},
      function (err, numAffected) {
        if (err) {
          console.log(err);
        } else {
          console.log(numAffected.nModified + " Instagram messages updated for " + databaseName + " at " + new Date());
        }
        return dbConnection.disconnect();
      });
  });
};


exports.updateUserProfile = updateUserProfile;
exports.updatePosts = updatePosts;