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
const CLIENT_SECRET = '26d1ec3a75874e3b925202183b99f13b';
const CLIENT_ID = 'cc8049f4f69d4f11b02d6319c55e0b58';

const API_ACCESS_TOKEN = 'https://api.instagram.com/oauth/access_token';
const API_LOGIN_DIALOG = 'https://api.instagram.com/oauth/authorize/';
const API_USER_POSTS = 'https://api.instagram.com/v1/users/self/media/recent/';
const API_USER_DATA = 'https://api.instagram.com/v1/users/self/';
const GRANT = 'authorization_code';
const DEFAULT_LANGUAGE = 'en';

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
                updateShareMessages(user.identities.configs.instagramConfig.instagramId, req.session.username, params.shareMessages);
                updateShareMessages(user.identities.configs.instagramConfig.instagramId, databaseName.globalData, params.shareMessages);
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
   * Delete Instagram information account, including posts.
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
          profile.identities.instagram.instagramId = userData.data.id;
          profile.identities.configs.instagramConfig.instagramId = userData.data.id;

          if (firstRequest) {

            // share default value
            instagramConfig.shareMessages = true;
            instagramConfig.shareProfile = true;
          }

          // save other Instagram data
          for (var key in InstagramProfileSchema) {
            if (InstagramProfileSchema.hasOwnProperty(key) && userData.data[key]) {
              profile.identities.instagram[key] = userData.data[key];
            }
          }

          // save followers and follows count and profile picture
          if (userData.data.id) {
            profile.identities.instagram['follows'] = userData.data.counts.follows;
            profile.identities.instagram['followed_by'] = userData.data.counts.followed_by;
            profile.identities.instagram['picture'] = userData.data.profile_picture;
          }


          // change profile picture
          if (profile.identities.instagram.picture) {
            profile.pictureUrl = profile.identities.instagram.picture;
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
  var friendsToSave = [];
  var temp = [];
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (!profile) {
      } else {
        dbConnection.disconnect();

        var instagramConfig = profile.identities.configs.instagramConfig;
        var params = {
          access_token: instagramConfig.accessToken,
          min_id: instagramConfig.lastPostId
        };

        var share = instagramConfig.shareMessages;

        // retrieve posts of the current user
        request.get({url: API_USER_POSTS, qs: params, json: true}, function (err, response, posts) {

          if (response.statusCode !== 200) {
            return err;
          }
          var messages = [];
          posts.data.forEach(function (post) {
            var location_name = null;
            var location_latitude = null;
            var location_longitude = null;
            if (post.location) {
              location_name = post.location.name;
              location_latitude = post.location.latitude;
              location_longitude = post.location.longitude;
            }
            var description = '';
            if (post.caption) {
              description = post.caption.text;
            }
            // carousel image/video control
            var images = [];
            if (post.type === 'carousel') {
              post.carousel_media.forEach( function (media) {
                if (media.type === 'image') {
                  images.push(media.images.standard_resolution.url);
                } else if (media.type === 'video') {
                  images.push(post.images.standard_resolution.url);
                }
              });
            } else {
              images.push(post.images.standard_resolution.url);
            }
            // users in photo control
            var users = [];
            var friends = [];
            if (post.users_in_photo) {

              post.users_in_photo.forEach( function (u) {

                users.push(u.user.username);
                friends.push({
                  username: username,
                  contactId: u.user.username,
                  source: 'instagram'
                })
              });
            }
            temp.push(friends);
            /*friendsToSave.forEach( function (u){
              if (u) {
                friendsToSave.push(u)
              }
            });*/

            instagramConfig.lastPostId  = instagramConfig.lastPostId ? instagramConfig.lastPostId : '0';
            if (instagramConfig.lastPostId < post.id) {
              messages.push({
                oId: post.id,
                text: description,
                source: 'instagram_' + instagramConfig.instagramId,
                fromUser: instagramConfig.instagramId,
                date: new Date(post.created_time * 1000), //unix time *1000
                images: images,
                likes: post.likes.count,
                comments: post.comments.count,
                location: location_name,
                latitude: location_latitude,
                longitude: location_longitude,
                refUsers: users,
                language: DEFAULT_LANGUAGE,
                // tags: post.tags,
                share: share
              });
            }
          });
          // console.log(messages);

          temp.forEach(function(u) {
            if(u && u.length > 0) {
              friendsToSave.push(u)
            }
          });
          // console.log(friendsToSave);
          storeFriends(friendsToSave, username).then(function () {
            storeFriends(friendsToSave, databaseName.globalData);
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
                      profile.identities.configs.instagramConfig.lastPostId = messages[0].oId;

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
 * Get Instagram user friends (people tagged in posts).
 * Params:
 *    friendsNumber - the number of friends to retrieve
 */
router.route('/instagram/friends')
  .post(function (req, res) {
    try {
      var friendsNumber = req.body.friendsNumber;

      // if the client do not specify a friends number to read then update the user friends
      if (!friendsNumber) {
        updatePosts(req.session.username).then(function () {
          res.status(200);
          res.json({auth: true});
        });
      } else {

        // return the friends
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
          return conn.Connection.find({source: /instagram/}).limit(friendsNumber);
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
    return conn.Message.deleteMany({fromUser: username, source: /instagram.*/}, function (err) {
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
      friend.forEach(function (fr){
        conn.Connection.findOneAndUpdate({
          username: fr.username,
          contactId: fr.contactId,
          source: 'instagram'

        }, fr, {upsert: true}, function () {

          if (i >= friends.length) {
            console.log(friends.length + " Instagram friends for " + fr.username + " saved or updated into " + databaseName);
            return dbConnection.disconnect();
          } else {
            loop(i);
          }
        });
      });
      i++;
    })(0);

  });
};
/**
 * Delete friends stored in the MongoDB database
 * @param username
 * @param databaseName
 */
var deleteFriends = function(username, databaseName) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    return conn.Connection.deleteMany({username: username, source: /instagram.*/}, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Instagram friends deleted from " + databaseName + " at " + new Date());
      }
      return dbConnection.disconnect();
    });
  });
};

exports.updateUserProfile = updateUserProfile;
exports.updatePosts = updatePosts;