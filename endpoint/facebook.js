'use strict';

var router = require('express').Router();
var request = require('request');
var qs = require('querystring');
var CrowdPulse = require('./../crowd-pulse-data');
var databaseName = require('./../crowd-pulse-data/databaseName');
var config = require('./../lib/config');
var FacebookProfileSchema = require('./../crowd-pulse-data/schema/facebookProfile');

const DB_PROFILES = databaseName.profiles;
const CLIENT_SECRET = '7ce264e7a782298475830477d9442bc6';
const CLIENT_ID = '637963103055683';

const FIELDS = ['id', 'email', 'first_name', 'last_name', 'link', 'name', 'about', 'age_range', 'birthday',
  'education', 'favorite_athletes', 'favorite_teams', 'gender', 'hometown', 'inspirational_people',
  'interested_in','languages', 'meeting_for', 'political', 'quotes', 'relationship_status', 'religion',
  'sports', 'website', 'work'];

const PERMISSIONS = ['email', 'public_profile', 'user_friends', 'user_likes', 'user_posts'];

const API_ACCESS_TOKEN = 'https://graph.facebook.com/v2.11/oauth/access_token';
const API_LOGIN_DIALOG = 'https://www.facebook.com/v2.11/dialog/oauth';
const API_USER_POSTS = 'https://graph.facebook.com/v2.11/me/feed';
const API_USER_LIKES = 'https://graph.facebook.com/v2.11/me/likes';
const API_USER_DATA = 'https://graph.facebook.com/v2.11/me?fields=' + FIELDS.join(',');


module.exports = function() {

  /**
   * Creates a login dialog URL.
   * Params:
   *    callbackUrl - the url send to Facebook as callback
   */
  router.route('/facebook/login_dialog')
    .post(function (req, res) {
      try {
        var params = {
          client_id: CLIENT_ID,
          redirect_uri: req.body.callbackUrl,
          state: 'state',
          scope: PERMISSIONS.join(',')
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
   *    code - the authorization code returned by Facebook after user login
   *    callbackUrl - the url send to Facebook as callback
   */
  router.route('/facebook/request_token')
    .post(function (req, res) {
      try {
        var params = {
          code: req.body.code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: req.body.callbackUrl
        };

        request.get({ url: API_ACCESS_TOKEN, qs: params, json: true }, function(err, response, oauthData) {
          if (response.statusCode !== 200 || err) {
            res.sendStatus(500);
          } else {

            // save access token in the database
            var dbConnection = new CrowdPulse();
            return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
              return conn.Profile.findOne({username: req.session.username}, function (err, profile) {
                if (profile) {
                  profile.identities.configs.facebookConfig = {
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
   * Get Facebook user profile information.
   */
  router.route('/facebook/profile')
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
   * Get Facebook user posts.
   * Params:
   *    messages - the number of messages to retrieve
   */
  router.route('/facebook/posts')
    .post(function (req, res) {
      try {
        var messagesToRead = req.body.messages;

        // if the client do not specify a messages to read number then update the user messages
        if (!messagesToRead) {
          updatePosts(req.session.username).then(function () {
            res.status(200);
            res.json({auth: true});
          });
        } else {

          // return the messages
          var dbConnection = new CrowdPulse();
          return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
            return conn.Message.find({source: /facebook_.*/}).sort({date: -1}).limit(messagesToRead);
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
   * Get Facebook user likes.
   * Params:
   *    likesNumber - the number of likes to retrieve
   */
  router.route('/facebook/likes')
    .post(function (req, res) {
      try {
        var likesNumber = req.body.likesNumber;

        // if the client do not specify a messages to read number then update the user messages
        if (!likesNumber) {
          updateLikes(req.session.username).then(function () {
            res.status(200);
            res.json({auth: true});
          });
        } else {

          // return the messages
          var dbConnection = new CrowdPulse();
          return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
            return conn.Like.find({source: /facebook_.*/}).sort({date: -1}).limit(likesNumber);
          }).then(function (likes) {
            dbConnection.disconnect();
            res.status(200);
            res.json({auth: true, likes: likes});
          });
        }

      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });


  /**
   * Delete Facebook information account, including posts and likes.
   */
  router.route('/facebook/delete')
    .delete(function (req, res) {
      try {
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
          return conn.Profile.findOne({username: req.session.username}, function (err, profile) {
            if (profile) {

              var facebookId = profile.identities.facebook.facebookId;
              deleteMessages(facebookId, req.session.username);
              deleteMessages(facebookId, databaseName.globalData);
              deleteLikes(facebookId, req.session.username);
              deleteLikes(facebookId, databaseName.globalData);

              profile.identities.facebook = undefined;
              profile.identities.configs.facebookConfig = undefined;
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
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      var facebookConfig = profile.identities.configs.facebookConfig;
      var params = {
        access_token: facebookConfig.accessToken
      };
      if (params.access_token) {

        // retrieve profile information about the current user
        request.get({ url: API_USER_DATA, qs: params, json: true }, function(err, response, userData) {

          if (response.statusCode !== 200) {
            return err;
          }

          // save the Facebook user ID
          profile.identities.facebook.facebookId = userData.id;
          profile.identities.configs.facebookConfig.facebookId = userData.id;

          // save other Facebook data
          for (var key in FacebookProfileSchema) {
            if (FacebookProfileSchema.hasOwnProperty(key) && userData[key]) {
              profile.identities.facebook[key] = userData[key];
            }
          }

          // save languages as array string
          var langs = [];
          userData.languages.forEach(function(lang) {langs.push(lang.name)});
          profile.identities.facebook.languages = langs;

          // save picture url
          profile.identities.facebook.picture = 'https://graph.facebook.com/v2.3/' + userData.id + '/picture?type=large';

          // change profile picture
          profile.pictureUrl = profile.identities.facebook.picture;

          profile.save().then(function () {
            dbConnection.disconnect();
          });

          callback(profile);
        });
      } else {
        callback(null);
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

        if (params.access_token) {

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
                text: post.message,
                source: 'facebook_' + facebookConfig.facebookId,
                fromUser: facebookConfig.facebookId,
                date: new Date(post.created_time),
                story: post.story,
                shares: post.shares,
                toUsers: toUsers
              });
            });

            storeMessages(messages, username).then(function () {
              storeMessages(messages, databaseName.globalData).then(function () {
                if (messages[0]) {

                  // create new db connection to save last post timestamp in the user profile config
                  dbConnection = new CrowdPulse();
                  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
                    return conn.Profile.findOne({username: username}, function (err, profile) {
                      if (profile) {
                        profile.identities.configs.facebookConfig.lastPostId = messages[0].date.getTime() / 1000;
                        profile.save().then(function () {
                          dbConnection.disconnect();
                        });
                      }
                    });
                  });
                }
              });
            });

          });
        }
      }

    });
  });
};

/**
 * Update user likes.
 * @param username
 */
var updateLikes = function(username) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var facebookConfig = profile.identities.configs.facebookConfig;
        var params = {
          access_token: facebookConfig.accessToken,
          limit: 1000
        };

        if (params.access_token) {

          // retrieve likes of the current user
          request.get({ url: API_USER_LIKES, qs: params, json: true }, function(err, response, likes) {

            if (response.statusCode !== 200) {
              return err;
            }

            var likesToSave = [];
            var i = 0;
            if (!facebookConfig.lastLikeId) {
              facebookConfig.lastLikeId = 0;
            }
            var likeDate = new Date(likes.data[i].created_time);
            while (i < likes.data.length && likeDate.getTime() > facebookConfig.lastLikeId) {
              likeDate = new Date(likes.data[i].created_time);
              likesToSave.push({
                oId: likes.data[i].id,
                name: likes.data[i].name,
                source: 'facebook_' + facebookConfig.facebookId,
                fromUser: facebookConfig.facebookId,
                date: likeDate
              });
              i++;
            }

            storeLikes(likesToSave, username).then(function () {
              storeLikes(likesToSave, databaseName.globalData).then(function () {
                if (likesToSave[0]) {

                  // create new db connection to save last like timestamp in the user profile config
                  dbConnection = new CrowdPulse();
                  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
                    return conn.Profile.findOne({username: username}, function (err, profile) {
                      if (profile) {
                        profile.identities.configs.facebookConfig.lastLikeId = likesToSave[0].date.getTime();
                        profile.save().then(function () {
                          dbConnection.disconnect();
                        });
                      }
                    });
                  });
                }
              });
            });
          });
        }
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
    messages.forEach(function (message) {
      return conn.Message.newFromObject(message).save().then(function () {
        messagesSaved++;
        if (messagesSaved >= messages.length) {
          console.log(messages.length + " messages from Facebook saved in " + databaseName + " at " + new Date());
          return dbConnection.disconnect();
        }
      });
    });
  });
};

/**
 * Store likes in the MongoDB database
 * @param likes
 * @param databaseName
 */
var storeLikes = function(likes, databaseName) {
  var dbConnection = new CrowdPulse();
  var likesSaved = 0;
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    likes.forEach(function (like) {
      return conn.Like.newFromObject(like).save().then(function () {
        likesSaved++;
        if (likesSaved >= likes.length) {
          console.log(likes.length + " likes from Facebook saved in " + databaseName + " at " + new Date());
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
        console.log("Facebook posts deleted from " + databaseName + " at " + new Date());
      }
      return dbConnection.disconnect();
    });
  });
};

/**
 * Delete likes stored in the MongoDB database
 * @param username
 * @param databaseName
 */
var deleteLikes = function(username, databaseName) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    return conn.Like.deleteMany({fromUser: username, source: /facebook.*/}, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Facebook likes deleted from " + databaseName + " at " + new Date());
      }
      return dbConnection.disconnect();
    });
  });
};

exports.updateUserProfile = updateUserProfile;
exports.updatePosts = updatePosts;
exports.updateLikes = updateLikes;