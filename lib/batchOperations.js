'use strict';

var config = require('../lib/config');
var CrowdPulse = require('../crowd-pulse-data');
var databaseName = require('../crowd-pulse-data/databaseName');
var cpLauncher = require('../lib/cpLauncher');

var twitter = require('../endpoint/twitter');
var facebook = require('../endpoint/facebook');
var linkedIn = require('../endpoint/linkedin');
var fitbit = require('../endpoint/fitbit');
var instagram = require('../endpoint/instagram');

const DELAY_EXTRACTION = 5000;
const DELAY_CROWD_PULSE_RUN = 60000;
const PLACEHOLDER = /{{dbName}}/g;
const APPS_BLACKLIST = config.androidAppBlackList;

const TIMEOUT_UPDATE_INTERESTS_MILLIS = 24 * 60 * 60 * 1000;  // one day in millis

/**
 * Update all user social information.
 * @param profiles: update profiles if true
 * @param messages: update messages if true
 * @param likes: update likes if true
 * @param friends: update friends if true
 */
exports.updateUserSocialInformation = function (profiles, messages, likes, friends) {

  var dbConnection = new CrowdPulse();
  dbConnection.connect(config.database.url, databaseName.profiles).then(function (conn) {
    return conn.Profile.find(function (err, profiles) {
      dbConnection.disconnect();

      if (profiles && profiles.length > 0) {
        (function loopWithDelay (i) {
          setTimeout(function () {
            var profile = profiles[i];

            if (profile.identities.configs.twitterConfig.twitterId) {
              if (profiles) {
                twitter.updateUserProfile(profile.username, null);
              }
              if (messages) {
                twitter.updateTweets(profile.username);
              }
              if (friends) {
                twitter.updateFriends(profile.username);
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
              if (friends) {
                facebook.updateFriends(profile.username);
              }
            }
            if (profile.identities.configs.instagramConfig.instagramId) {
              if (profiles) {
                instagram.updateUserProfile(profile.username, null);
              }
              if (messages) {
                instagram.updatePosts(profile.username);
              }
            }
            if (profile.identities.configs.linkedInConfig.linkedInId) {
              if (profiles) {
                linkedIn.updateUserProfile(profile.username, null);
              }
            }
            if (profile.identities.configs.fitbitConfig.fitbitId) {
              if (profiles) {
                  fitbit.updateToken(profile.username, null);
                }
            }

            if (i--) {
              loopWithDelay(i);
            }
          }, DELAY_EXTRACTION);
        })(profiles.length - 1);
      }
    });
  });
};

/**
 * Execute CrowdPulse projects set in configuration file.
 */
exports.executeCrowdPulseProjects = function () {

  // reading the CrowdPulse project name to execute from configuration file
  var projectsName = config['crowd-pulse'].projects;

  if (!projectsName || projectsName.length === 0) {
    console.log("No CrowdPulse projects set");
  } else {
    var dbConnection = new CrowdPulse();
    dbConnection.connect(config.database.url, databaseName.profiles).then(function (conn) {

      // get all user profiles
      return conn.Profile.find(function (err, profiles) {
        dbConnection.disconnect();

        if (profiles && profiles.length > 0) {

          // for each profile execute the CrowdPulse project, setting a delay
          (function loopProfiles (i) {
            var profile = profiles[i];
            (function loopProjectsWithDelay (j) {
              setTimeout(function () {
                var project = projectsName[j];

                // run CrowdPulse
                runCrowdPulse(project, profile.username);

                // stop conditions
                if (j--) {

                  // if j != 0 loop projects
                  loopProjectsWithDelay(j);

                } else if (i--) {

                  // if i != 0 loop profiles
                  loopProfiles(i);
                }
              }, DELAY_CROWD_PULSE_RUN);
            })(projectsName.length - 1);
          })(profiles.length - 1);

          // execute CrowdPulse projects for global data
          (function loopProjectsWithDelay (j) {
            setTimeout(function () {
              var project = projectsName[j];

              // run CrowdPulse
              runCrowdPulse(project, databaseName.globalData);

              // stop conditions
              if (j--) {

                // if j != 0 loop projects
                loopProjectsWithDelay(j);
              }
            }, DELAY_CROWD_PULSE_RUN);
          })(projectsName.length - 1);
        }

      });
    });
  }
};

/**
 * Update demographics data for all users.
 */
exports.updateInterests = function () {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName.profiles).then(function (conn) {
    return conn.Profile.find(function (err, profiles) {
      dbConnection.disconnect();
      if (profiles) {
        profiles.forEach(function (profile) {
          updateInterestsForUser(profile.username);

          // temporal decay after 5 minutes
          // not used
          /*
          setTimeout(function () {
            updateInterestConfidence(profile.username);
          }, 5 * 60 * 1000);
          */
        });
      }

      // generate/update interests for global data
      updateInterestsForUser(databaseName.globalData);

      // temporal decay after 5 minutes
      // not used
      /*
      setTimeout(function () {
        updateInterestConfidence(databaseName.globalData);
      }, 5 * 60 * 1000);
      */
    });
  });
};

/**
 * Update demographics data for all users.
 */
exports.updateDemographics = function () {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName.profiles).then(function (conn) {
    return conn.Profile.find(function (err, profiles) {
      dbConnection.disconnect();
      if (profiles) {
        profiles.forEach(function (profile) {
          updateDemographicsForUser(profile.username);
        });
      }
    });
  });
};

/**
 * Run single CrowdPulse project for a specified username.
 * @param projectName: CrowdPulse project name
 * @param username: the user name
 */
var runCrowdPulse = function (projectName, username) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, config.database.db).then(function (conn) {
    return conn.Project.findOne({name: projectName})
      .then(function (project) {
        return project.createNewRun(config.logs.path);
      })
      .spread(function (project, run) {
        console.log(projectName + " is running for " + username + " at " + new Date());
        project.config = project.config.replace(PLACEHOLDER, username);

        return [project, run];
      })
      // launch the run
      .spread(cpLauncher.executeProjectRun)

  }).then(function () {
    dbConnection.disconnect();
  });
};

/**
 * Update demographics user data.
 * @param username: the user name
 */
var updateDemographicsForUser = function (username) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, databaseName.profiles).then(function (conn) {
    return conn.Profile.findOne({username: username}, function (err, user) {
      if (user) {
        var timestamp = new Date().getTime();
        var facebookIdentity = user.identities.facebook;
        var instagramIdentity = user.identities.instagram;
        var twitterIdentity = user.identities.twitter;
        var linkedInIdentity = user.identities.linkedIn;
        var mobileDevices = user.identities.devices;
        // var fitBitIdentity = user.identities.fitBit;

        // save name
        if (linkedInIdentity.firstName && linkedInIdentity.lastName) {
          user.demographics.name.value = linkedInIdentity.firstName +  " " + linkedInIdentity.lastName;
          user.demographics.name.source = 'linkedin';

        } else if (facebookIdentity.name) {
          user.demographics.name.value = facebookIdentity.name;
          user.demographics.name.source = 'facebook';

        } else if (instagramIdentity.full_name) {
          user.demographics.name.value = instagramIdentity.full_name;
          user.demographics.name.source = 'instagram';

        } else if (twitterIdentity.name) {
          user.demographics.name.value = twitterIdentity.name;
          user.demographics.name.source = 'twitter';
        }

        // save location
        if (linkedInIdentity.location) {
          var linkedInLocation = {
            value: linkedInIdentity.location,
            source: 'linkedin',
            confidence: 1,
            timestamp: timestamp
          };
          if (user.demographics.location.length > 0) {
            user.demographics.location.push(linkedInLocation);
          } else {
            user.demographics.location = [linkedInLocation];
          }

        } else if (twitterIdentity.location) {
          var twitterLocation = {
            value: twitterIdentity.location,
            source: 'twitter',
            confidence: 1,
            timestamp: timestamp
          };
          if (user.demographics.location.length > 0) {
            user.demographics.location.push(twitterLocation);
          } else {
            user.demographics.location = [twitterLocation];
          }
        }

        // save image
        if (linkedInIdentity.pictureUrl) {
          var linkedInImage = {
            value: linkedInIdentity.pictureUrl,
            source: 'linkedin',
            confidence: 1,
            timestamp: timestamp
          };
          if (user.demographics.image.length > 0) {
            user.demographics.image.push(linkedInImage);
          } else {
            user.demographics.image = [linkedInImage];
          }
        }

        if (facebookIdentity.picture) {
          var facebookImage = {
            value: facebookIdentity.picture,
            source: 'facebook',
            confidence: 1,
            timestamp: timestamp
          };
          if (user.demographics.image.length > 0) {
            user.demographics.image.push(facebookImage);
          } else {
            user.demographics.image = [facebookImage];
          }
        }

        if (instagramIdentity.picture) {
          var instagramImage = {
            value: instagramIdentity.picture,
            source: 'instagram',
            confidence: 1,
            timestamp: timestamp
          };
          if (user.demographics.image.length > 0) {
            user.demographics.image.push(instagramImage);
          } else {
            user.demographics.image = [instagramImage];
          }
        }

        if (twitterIdentity.profile_image_url) {
          var twitterImage = {
            value: twitterIdentity.profile_image_url,
            source: 'twitter',
            confidence: 1,
            timestamp: timestamp
          };
          if (user.demographics.image.length > 0) {
            user.demographics.image.push(twitterImage);
          } else {
            user.demographics.image = [twitterImage];
          }
        }

        // save email
        if (linkedInIdentity.emailAddress) {
          var linkedInEmail = {
            value: linkedInIdentity.emailAddress,
            source: 'linkedin',
            confidence: 1,
            timestamp: timestamp
          };
          if (user.demographics.email.length > 0) {
            user.demographics.email.push(linkedInEmail);
          } else {
            user.demographics.email = [linkedInEmail];
          }
        }

        if (facebookIdentity.email) {
          var facebookEmail = {
            value: facebookIdentity.email,
            source: 'facebook',
            confidence: 1,
            timestamp: timestamp
          };
          if (user.demographics.email.length > 0) {
            user.demographics.email.push(facebookEmail);
          } else {
            user.demographics.email = [facebookEmail];
          }
        }

        // remove duplicates for (email)
        if (user.demographics.email.length > 0) {

          // index of elements to remove
          var indexToRemove = [];
          for (var i = 0; i < user.demographics.email.length; i++) {
            var currentEmail = user.demographics.email[i];
            for (var j = i + 1; j < user.demographics.email.length; j++) {
              if (currentEmail.value === user.demographics.email[j].value
                && currentEmail.timestamp === user.demographics.email[j].timestamp) {
                indexToRemove.push(j);
              }
            }
          }

          // remove creating a new array without duplicates
          var newEmailArray = [];
          for (i = 0; i < user.demographics.email.length; i++) {
            var toSave = true;
            j = 0;
            while (j < indexToRemove.length && toSave) {
              if (i === indexToRemove[j]) {
                toSave = false;
              }
              j++;
            }
            if (toSave) {
              newEmailArray.push(user.demographics.email[i]);
            }
          }

          user.demographics.email = newEmailArray;
        }


        // save gender
        if (facebookIdentity.gender) {
          user.demographics.gender.value = facebookIdentity.gender;
          user.demographics.gender.source = 'facebook';
          user.demographics.gender.timestamp = timestamp;
          user.demographics.gender.confidence = 1;
        }

        // save language
        if (facebookIdentity.language) {
          var languages = [];
          facebookIdentity.language.forEach(function (lang) {
            languages.push({
              value: lang,
              source: 'facebook',
              confidence: 1,
              timestamp: timestamp
            });
          });
          if (user.demographics.language.length > 0) {
            languages.forEach(function (lang) {
              user.demographics.language.push(lang);
            });
          } else {
            user.demographics.language = languages;
          }

        } else if (twitterIdentity.lang) {
          var twitterLang = {
            value: twitterIdentity.lang,
            source: 'twitter',
            confidence: 1,
            timestamp: timestamp
          };
          if (user.demographics.language.length > 0) {
            user.demographics.language.push(twitterLang);
          } else {
            user.demographics.language = [twitterLang];
          }
        }

        // TODO save work (actually not retrieved from linkedIn)

        // save industry
        if (linkedInIdentity.industry) {
          var linkedInIndustry = {
            value: linkedInIdentity.industry,
            source: 'linkedin',
            timestamp: timestamp,
            confidence: 1
          };
          if (user.demographics.industry.length > 0) {
            user.demographics.industry.push(linkedInIndustry);
          } else {
            user.demographics.industry = [linkedInIndustry];
          }
        }

        // TODO save height
        // TODO save weight
        // TODO save dateOfBirth
        // TODO save country

        // save device
        if (mobileDevices.length) {
          var devices = [];
          mobileDevices.forEach(function (device) {
            devices.push({
              brand: device.brand,
              model: device.model,
              skd: device.sdk,
              phoneNumbers: device.phoneNumbers,
              source: 'android',
              confidence: 1,
              timestamp: timestamp
            });
          });
          if (user.demographics.device.length > 0) {
            devices.forEach(function (device) {
              user.demographics.device.push(device);
            });
          } else {
            user.demographics.device = devices;
          }
        }

        // Save Instagram bio
        if (instagramIdentity.bio) {
          var instagramBio = {
            value: instagramIdentity.bio,
            source: 'instagram',
            timestamp: timestamp,
            confidence: 1
          };
          if (user.demographics.bio && user.demographics.bio.length > 0) {
            user.demographics.bio.push(instagramBio);
          } else {
            user.demographics.bio = [instagramBio];
          }
        }

        //save Instagram website
        if (instagramIdentity.website) {
          var instagramWebsite = {
            value: instagramIdentity.website,
            source: 'instagram',
            timestamp: timestamp,
            confidence: 1
          };
          if (user.demographics.website && user.demographics.website.length > 0) {
            user.demographics.website.push(instagramWebsite);
          } else {
            user.demographics.website = [instagramWebsite];
          }
        }
        // console.log(user.demographics);
        // save profile updated
        user.save().then(function () {
          console.log("Demographics data updated for " + username);
          dbConnection.disconnect();
        });

      } else {
        dbConnection.disconnect();
      }
    });
  });
};

/**
 * Update interests user data.
 * @param username: the user name
 */
var updateInterestsForUser = function (username) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, username).then(function (conn) {
    var timestamp = new Date().getTime();
    var filter;

    return conn.Interest.find({source: { $ne: 'like' }}, function (err, interests) {
      if (interests.length > 0) {

       // filter messages extracted two day ago
       filter = timestamp - 2 * TIMEOUT_UPDATE_INTERESTS_MILLIS;
       } else {
       filter = 0;
       }

      conn.Message.find({date: {$gt: new Date(filter)}}, function (err, messages) {
        var interests = [];

        if (messages.length) {
          messages.forEach(function (message) {

            // copy message tokens
            if (message.tokens && message.tokens.length) {
              message.tokens.forEach(function (token) {
                if (!token.stopWord) {
                  if (token.text.startsWith('#')) {

                    // for global data use only messages with true share property
                    if (username !== databaseName.globalData || message.share) {
                      interests.push({
                        value: token.text.substr(1),
                        source: 'message_token',
                        confidence: 1,
                        timestamp: timestamp
                      });
                    }
                  }
                }
              });
            }

            // TODO pre-process wikipedia categories
            // copy message tags and tags category
            if (message.tags && message.tags.length) {
              message.tags.forEach(function (tag) {

                if (!tag.stopWord) {
                  if (username !== databaseName.globalData || message.share) {
                    interests.push({
                      value: tag._id,
                      source: 'message_tag',
                      confidence: 1,
                      timestamp: timestamp
                    });
                  }
                }

                if (tag.categories) {
                  tag.categories.forEach(function(category) {
                    if (!category.stopWord) {

                      // for global data use only messages with true share property
                      if (username !== databaseName.globalData || message.share) {
                        interests.push({
                          value: category.text,
                          source: 'message_tag_category',
                          confidence: 1,
                          timestamp: timestamp
                        });
                      }
                    }
                  });
                }
              });
            }
          });
        }

        // copy likes
        conn.Like.find({date: {$gt: new Date(filter)}}, function (err, likes) {
          if (!err) {
            likes.forEach(function (like) {

              // for global data use only likes with true share property
              if (username !== databaseName.globalData || like.share) {
                interests.push({
                  value: like.category,
                  source: 'like',
                  confidence: 1,
                  timestamp: timestamp
                });
              }
            });
          }

          // copy app category
          conn.PersonalData.find({source: 'appinfo', timestamp: {$gt: filter + TIMEOUT_UPDATE_INTERESTS_MILLIS}},  function (err, apps) {
            if (!err) {
              apps.forEach(function (app) {
                var skip = false;
                var i = 0;
                while (i < APPS_BLACKLIST.length && !skip) {
                  skip = app.packageName === APPS_BLACKLIST[i];
                  i++;
                }
                if (!skip) {
                  if (app.category) {

                    // for global data use only apps with true share property
                    if (username !== databaseName.globalData || app.share) {
                      interests.push({
                        value: app.category,
                        source: 'app_category',
                        confidence: app.foregroundTime,
                        timestamp: timestamp
                      });
                    }
                  }
                }
              });
            }

            // save interest
            conn.Interest.insertMany(interests, function (err, docs) {
              if (!err) {
                console.log(docs.length + " interests data updated for " + username);
              }
              dbConnection.disconnect();
            });

          });
        });

      });
    });
  });
};


/**
 * Confidence temporal decay function for interests.
 */
var updateInterestConfidence = function (username) {
  var dbConnection = new CrowdPulse();
  return dbConnection.connect(config.database.url, username).then(function (conn) {
    return conn.Interest.find({}, function (err, interests) {
      var currentTimestamp = new Date().getTime();

      if (interests.length) {
        interests.forEach(function (interest, i) {

          if (currentTimestamp - interest.timestamp >= TIMEOUT_UPDATE_INTERESTS_MILLIS) {

            if (interest.confidence <= 0) {
              interest.confidence = 0;
            } else {
              interest.confidence -= 0.01;
            }

            interest.save().then(function () {
              if (i >= interests.length - 1) {
                dbConnection.disconnect();
                console.log("Interests updated with temporal decay function for " + username + " at " + new Date());
              }
            });
          }
        });
      }

    });
  });
};

/**
 * Clean personal data.
 */
exports.cleanPersonalData = function() {
  var dbConnection = new CrowdPulse();
  dbConnection.connect(config.database.url, databaseName.profiles).then(function (conn) {
    return conn.Profile.find(function (err, profiles) {
      dbConnection.disconnect();
      if (profiles) {

        // add globalData to profiles
        profiles.push({username: databaseName.globalData});

        profiles.forEach(function (profile) {

          var dbConnection = new CrowdPulse();
          dbConnection.connect(config.database.url, profile.username).then(function (conn) {

            // clean GPS data for specified user
            conn.PersonalData.deleteMany({source: 'gps', latitude: '0', longitude: '0'}, function (err) {
              if (err) {
                console.log(err);
              } else {
                console.log("GPS inconsistent data deleted from " + profile.username + " at " + new Date());
              }

              // remove duplicates
              conn.PersonalData.findDuplicatedActivityData().then(function (data) {
                data.forEach(function (doc) {
                  doc.dups.shift();
                  doc.dups.forEach(function (toDelete) {
                    conn.PersonalData.deleteMany({ _id: toDelete}, function (err) {
                      if (err) {
                        console.log(err);
                      }
                    });
                  });
                });
              });

              // remove duplicates
              conn.PersonalData.findDuplicatedAppInfoData().then(function (data) {
                data.forEach(function (doc) {
                  doc.dups.shift();
                  doc.dups.forEach(function (toDelete) {
                    conn.PersonalData.deleteMany({ _id: toDelete}, function (err) {
                      if (err) {
                        console.log(err);
                      }
                    });
                  });
                });
              });

              // remove duplicates
              conn.PersonalData.findDuplicatedDisplayData().then(function (data) {
                data.forEach(function (doc) {
                  doc.dups.shift();
                  doc.dups.forEach(function (toDelete) {
                    conn.PersonalData.deleteMany({ _id: toDelete}, function (err) {
                      if (err) {
                        console.log(err);
                      }
                    });
                  });
                });
              });

              // remove duplicates
              conn.PersonalData.findDuplicatedGPSData().then(function (data) {
                data.forEach(function (doc) {
                  doc.dups.shift();
                  doc.dups.forEach(function (toDelete) {
                    conn.PersonalData.deleteMany({ _id: toDelete}, function (err) {
                      if (err) {
                        console.log(err);
                      }
                    });
                  });
                });
              });

              // remove duplicates
              conn.PersonalData.findDuplicatedNetStatsData().then(function (data) {
                data.forEach(function (doc) {
                  doc.dups.shift();
                  doc.dups.forEach(function (toDelete) {
                    conn.PersonalData.deleteMany({ _id: toDelete}, function (err) {
                      if (err) {
                        console.log(err);
                      }
                    });
                  });
                });
              });

              // delete specific applications data


              setTimeout(function () {
                console.log("Duplicated data deleted from " + profile.username + " at " + new Date());
                dbConnection.disconnect();
              }, 3 * 60 * 1000);

            });
          });

          // TODO add here other cleaning operations (eg. null data, etc)
        });
      }

    });
  });
};

// export function to use in other module
exports.runCrowdPulse = runCrowdPulse;
exports.updateDemographicsForUser = updateDemographicsForUser;
exports.updateInterestsForUser = updateInterestsForUser;