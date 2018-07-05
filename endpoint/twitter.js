'use strict';

var router = require('express').Router();
var request = require('request');
var Q = require('q');
var qs = require('querystring');
var CrowdPulse = require('./../crowd-pulse-data');
var databaseName = require('./../crowd-pulse-data/databaseName');
var config = require('./../lib/config');
var TwitterProfileSchema = require('./../crowd-pulse-data/schema/twitterProfile');
var batch = require('./../lib/batchOperations');
const DB_PROFILES = databaseName.profiles;
const DB_GLOBAL_DATA = databaseName.globalData;
const CONSUMER_KEY = 'iigvOYorVOvnKScjm5t22ak5E';
const CONSUMER_SECRET = '5j0tpR5lwdzjW18qgdCqYndiScAwoMtCWUD32GPfR0elTHnytI';
const API_REQUEST_TOKEN = 'https://api.twitter.com/oauth/request_token';
const API_ACCESS_TOKEN = 'https://api.twitter.com/oauth/access_token';
const API_AUTHENTICATION = 'https://api.twitter.com/oauth/authenticate';
const API_TIMELINE = 'https://api.twitter.com/1.1/statuses/user_timeline.json';
const API_PROFILE = 'https://api.twitter.com/1.1/users/show.json';
const API_FOLLOWINGS = 'https://api.twitter.com/1.1/friends/list.json';
const API_FOLLOWERS = 'https://api.twitter.com/1.1/followers/list.json';

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
   * Update Twitter configuration reading parameters from query.
   */
  router.route('/twitter/config')
    .get(function (req, res) {
      try {
        var params = req.query;
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
          return conn.Profile.findOne({username: req.session.username}, function (err, user) {
            if (user) {

              if (params.shareProfile !== null && params.shareProfile !== undefined) {
                user.identities.configs.twitterConfig.shareProfile = params.shareProfile;
              }

              if (params.shareMessages !== null && params.shareMessages !== undefined) {
                user.identities.configs.twitterConfig.shareMessages = params.shareMessages;
                updateShareMessages(user.identities.configs.twitterConfig.twitterId, req.session.username, params.shareMessages);
                updateShareMessages(user.identities.configs.twitterConfig.twitterId, DB_GLOBAL_DATA, params.shareMessages);
              }

              if (params.shareFriends !== null && params.shareFriends !== undefined) {
                user.identities.configs.twitterConfig.shareFriends = params.shareFriends;
                updateShareFriends(req.session.username, req.session.username, params.shareFriends);
                updateShareFriends(req.session.username, DB_GLOBAL_DATA, params.shareFriends);
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
   * Get Twitter user friends (followings).
   * Params:
   *    friendsNumber - the number of friends to retrieve
   */
  router.route('/twitter/friends')
    .post(function (req, res) {
      try {
        var friendsNumber = req.body.friendsNumber;

        // if the client do not specify a friends number to read then update the user friends
        if (!friendsNumber) {
          updateFriends(req.session.username).then(function () {
            res.status(200);
            res.json({auth: true});
          });
        } else {

          // return the friends
          var dbConnection = new CrowdPulse();
          return dbConnection.connect(config.database.url, req.session.username).then(function (conn) {
            return conn.Connection.find({source: /twitter/}).limit(friendsNumber);
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
              deleteFriends(req.session.username, req.session.username);
              deleteFriends(req.session.username, databaseName.globalData);

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

  // default empty callback
  if (!callback) {
    callback = function () {}
  }

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

      // true if it is the first time user requests twitter profile
      var firstRequest = !profile.identities.twitter.twitterId;

      request.get({url:API_PROFILE, oauth:oauth, qs:params, json:true}, function (err, response, userData) {
        if (err) {
          return err;
        }

        // save the Twitter user ID
        if (userData.id) {
          profile.identities.twitter.twitterId = userData.id;
        }

        if (firstRequest) {

          // share default value
          profile.identities.configs.twitterConfig.shareFriends = true;
          profile.identities.configs.twitterConfig.shareMessages = true;
          profile.identities.configs.twitterConfig.shareProfile = true;
        }

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
          console.log("Twitter profile of " + username + " updated at " + new Date());
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
    count: 200,
    tweet_mode: 'extended'
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

      var share = twitterConfig.shareMessages;

      // request timeline
      request.get({url: API_TIMELINE, oauth: oauth, qs: params, json: true}, function (error, response, tweets) {
        if (tweets && tweets.length > 0) {
          var messages = [];
          tweets.forEach(function (tweet) {
            var tweetToSave = {
              oId: tweet.id_str,
              text: tweet.full_text,
              source: 'twitter_' + tweet.user.id,
              fromUser: tweet.user.screen_name,
              date: new Date(tweet.created_at),
              language: tweet.lang,
              favs: tweet.favorite_count,
              shares: tweet.shares_count,
              toUsers: tweet.in_reply_to_screen_name,
              parent: tweet.in_reply_to_status_id,
              share: share
            };

            if (tweet.coordinates) {

              // if there are exacts coordinates
              tweetToSave.latitude = tweet.coordinates.coordinates[1];
              tweetToSave.longitude = tweet.coordinates.coordinates[0];

            } else if (tweet.place && tweet.place.bounding_box && tweet.place.bounding_box.coordinates) {

              // retrieve coordinates from the place (if any), reading the first coordinates of place bounding box
              tweetToSave.latitude = tweet.place.bounding_box.coordinates[0][0][1];
              tweetToSave.longitude = tweet.place.bounding_box.coordinates[0][0][0];
            }

            // get other users mention in the tweet
            if (tweet.entities && tweet.entities.user_mentions.length) {
              var mentions = [];
              tweet.entities.user_mentions.forEach(function (mention) {
                mentions.push(mention.screen_name);
              });
              tweetToSave.refUsers = mentions;
            }

            messages.push(tweetToSave);
          });

          storeMessages(messages, DB_GLOBAL_DATA).then(function () {
            storeMessages(messages, username).then(function () {

              // if new messages are saved
              if (messages.length > 0) {

                // create new db connection to save last tweet id in the user profile config
                dbConnection = new CrowdPulse();
                dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
                  conn.Profile.findOne({username: username}, function (err, profile) {
                    if (profile) {
                      profile.identities.configs.twitterConfig.lastTweetId = messages[0].oId;
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
        }
      });
    }
  });
};

/**
 * Update user friends.
 * @param username
 */
var updateFriends = function(username) {

  // twitter oauth data
  var oauth = {
    consumer_key: CONSUMER_KEY,
    consumer_secret: CONSUMER_SECRET,
    token: null,
    token_secret: null
  };

  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, profile) {
      if (profile) {
        dbConnection.disconnect();

        var twitterConfig = profile.identities.configs.twitterConfig;
        oauth.token = twitterConfig.oauthToken;
        oauth.token_secret = twitterConfig.oauthTokenSecret;

        var share = twitterConfig.shareFriends;

        // request params, cursor -1 is used to retrieve the first results page
        var params = {
          count: 200,
          include_user_entities: false,
          cursor: -1
        };

        var friendsToSave = [];

        // retrieve connection of the current user, iterate over all results page using cursor
        (function loop (params, api) {
          request.get({ url: api, oauth: oauth, qs: params, json: true}, function(err, response, friends) {

            if (response.statusCode !== 200) {
              return err;
            }
            var i = 0;
            while (i < friends.users.length) {
              friendsToSave.push({
                username: username,
                contactId: friends.users[i].screen_name,
                contactName: friends.users[i].name,
                source: 'twitter',
                type: api === API_FOLLOWINGS? 'following': 'followers',
                share: share
              });
              i++;
            }

            // break condition
            if (friends.next_cursor_str !== '0') {

              // update cursor
              params.cursor = friends.next_cursor_str;
              loop(params, api);

            } else if (api === API_FOLLOWINGS) {

              // extract followers, reset cursor
              params.cursor = -1;
              loop(params, API_FOLLOWERS);

            } else {

              // finally store all connection (followings and followers)
              storeFriends(friendsToSave, username).then(function () {
                storeFriends(friendsToSave, databaseName.globalData);
              });
            }

          });
        })(params, API_FOLLOWINGS);
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
          console.log(messages.length + " messages from Twitter saved in " + databaseName + " at " + new Date());
          return dbConnection.disconnect();
        }
      });
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
        source: 'twitter',
        contactId: friend.contactId,
        type: friend.type
      }, friend, {upsert: true}, function () {
        i++;
        if (i >= friends.length) {
          console.log(friends.length + " Twitter friends for " + friend.username + " saved or updated into " + databaseName);
          return dbConnection.disconnect();
        } else {
          loop(i);
        }
      });
    })(0);

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

/**
 * Delete friends stored in the MongoDB database
 * @param username
 * @param databaseName
 */
var deleteFriends = function(username, databaseName) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    return conn.Connection.deleteMany({username: username, source: /twitter.*/}, function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Twitter friends deleted from " + databaseName + " at " + new Date());
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
    return conn.Message.update({source: 'twitter_' + userId}, {$set: {share: share}}, {multi: true},
      function (err, numAffected) {
        if (err) {
          console.log(err);
        } else {
          console.log(numAffected.nModified + " Twitter messages updated for " + databaseName + " at " + new Date());
        }
        return dbConnection.disconnect();
    });
  });
};

/**
 * Update share option for friends.
 * @param username
 * @param databaseName
 * @param share
 */
var updateShareFriends = function (username, databaseName, share) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName).then(function (conn) {
    return conn.Connection.update({username: username, source: 'twitter'}, {$set: {share: share}}, {multi: true},
      function (err, numAffected) {
        if (err) {
          console.log(err);
        } else {
          console.log(numAffected.nModified + " Twitter friends updated for " + databaseName + " at " + new Date());
        }
        return dbConnection.disconnect();
      });
  });
};

exports.updateUserProfile = updateUserProfile;
exports.updateTweets = updateTweets;
exports.updateFriends = updateFriends;