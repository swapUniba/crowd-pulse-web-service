'use strict';

var Q = require('q');
var bcrypt = require('bcryptjs');
var config = require('./../lib/config');
var CrowdPulse = require('./../crowd-pulse-data');
var databaseName = require('./../crowd-pulse-data/databaseName');

const FAIL = 0;         //code for any failure
const SUCCESS = 1;      //code for any success
const RECEIVING = 2;    //if mobile app is receiving data (eg. configuration from web app)

const DB_GLOBAL_DATA = databaseName.globalData;
const DB_PROFILES = databaseName.profiles;
const WEB_UI_CLIENT = "web-ui";

// source string type used for filtering data
const SOURCE_CONTACT = "contact";
const SOURCE_ACCOUNTS = "accounts";

const RESPONSE = {
  "user_not_found": {
    "code": FAIL,
    "description": "User not found"
  },
  "wrong_password": {
    "code": FAIL,
    "description": "Wrong password"
  },
  "login_success": {
    "code": SUCCESS,
    "description": "Login Ok"
  },
  "not_authorized": {
    "code": FAIL,
    "description": "User not authorized. Login required."
  },
  "config_acquired": {
    "code": SUCCESS,
    "description": "Configuration correctly saved."
  },
  "device_not_found": {
    "code": FAIL,
    "description": "The deviceID doesn't match any deviceID stored."
  },
  "data_acquired": {
    "code": SUCCESS,
    "description": "Data correctly saved."
  },
  "data_format_error": {
    "code": FAIL,
    "description": "Data format not valid."
  },
  "data_request_sent": {
    "code": RECEIVING,
    "description": "Your request has been sent to the device."
  }
};


module.exports = function (io) {

  io.on('connection', function (socket) {
    var deviceId = null;
    var username = null;

    console.log('A user connected: ' + socket.id);

    socket.on('login', function (data) {
      console.log("deviceID: " + data.deviceId);

      if (data.deviceId) {
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
          return conn.Profile.findOne({email: data.email}, function (err, user) {
            if (!user) {
              console.log("Login failed");
              socket.emit("login", RESPONSE["user_not_found"]);
            } else {
              bcrypt.compare(data.password, user.password, function (err, isMatch) {
                if (!isMatch && !(data.password === user.password && data.client === WEB_UI_CLIENT)) {
                  console.log("Login failed");
                  socket.emit("login", RESPONSE["wrong_password"]);
                } else {
                  console.log("Login Ok");
                  username = user.username;

                  if (data.client !== WEB_UI_CLIENT) {
                    var deviceData = {
                      deviceId: data.deviceId,
                      brand: data.brand,
                      model: data.model,
                      sdk: data.sdk,
                      phoneNumbers: data.phoneNumbers
                    };

                    if (user.identities.devices) {
                      var found = false;
                      for (var i = 0; i < user.identities.devices.length && !found; i++) {
                        if (data.deviceId === user.identities.devices[i].deviceId) {
                          user.identities.devices[i] = deviceData;
                          found = true;
                        }
                      }
                      if (!found) {
                        user.identities.devices.push(deviceData);
                      }
                    } else {
                      user.identities.devices = [deviceData];
                    }

                    user.save().then(function () {
                      dbConnection.disconnect();
                    });
                  }

                  deviceId = data.deviceId;
                  socket.join(deviceId);

                  RESPONSE["login_success"].username = username;
                  io.in(deviceId).emit("login", RESPONSE["login_success"]);
                }
              });
            }
          });
        });
      } else {
        console.log('DeviceID not found');
        socket.emit("login", RESPONSE["data_format_error"]);
      }

    });

    socket.on('config', function (data) {
      if (deviceId) {
        var dbConnection = new CrowdPulse();
        return dbConnection.connect(config.database.url, DB_PROFILES).then(function(conn) {
          return conn.Profile.findOne({'identities.devices': {$elemMatch: { deviceId: deviceId}}}, function (err, user) {
            if (!user) {
              socket.emit("config", RESPONSE["device_not_found"]);
            } else {
              if (data && data.deviceId) {
                if (user.identities.configs.devicesConfig) {
                  var oldConfig;

                  // search the configuration by device ID
                  var found = false;
                  for (var i = 0; i < user.identities.configs.devicesConfig.length && !found; i++) {
                    if (deviceId === user.identities.configs.devicesConfig[i].deviceId) {
                      oldConfig = user.identities.configs.devicesConfig[i];
                      user.identities.configs.devicesConfig[i] = data;
                      found = true;

                      // the configuration is changed, update personal data with the new share options (if any)
                      updateShareOption(user.username, deviceId, oldConfig, data, user.username);
                      updateShareOption(user.username, deviceId, oldConfig, data, DB_GLOBAL_DATA);
                    }
                  }
                  if (!found) {
                    user.identities.configs.devicesConfig.push(data);
                  }
                } else {
                  user.identities.configs.devicesConfig = [data];
                }
                user.save().then(function () {
                  console.log("Configuration updated");
                  dbConnection.disconnect();
                });

              } else {

                //the device is asking for an updated configuration, search it by device ID
                var found = false;
                for (var i = 0; i < user.identities.configs.devicesConfig.length && !found; i++) {
                  if (deviceId === user.identities.configs.devicesConfig[i].deviceId) {
                    data = user.identities.configs.devicesConfig[i];
                    found = true;
                  }
                }
              }

              RESPONSE["config_acquired"].config = data;

              // new configuration coming from web ui
              if (data.client === WEB_UI_CLIENT) {

                // remove client field to prevent App crash
                data.client = undefined;
                RESPONSE["config_acquired"].code = RECEIVING;
              } else {
                RESPONSE["config_acquired"].code = SUCCESS;
              }

              io.in(deviceId).emit("config", RESPONSE["config_acquired"]);
            }
          });
        });
      } else {
        console.log('User not authorized');
        socket.emit("config", RESPONSE["not_authorized"]);
      }
    });

    socket.on('send_data', function (data) {

      //device is logged in or data contains correct information
      //TODO IMPORTANT check if deviceId exists for the given username
      if ((deviceId && username) || (data.deviceId && data.username)) {
        socket.join(data.deviceId);

        //web ui is asking data
        if (data.client === WEB_UI_CLIENT) {
          console.log("Send data requested for " + data.deviceId + " by web UI");
          io.in(data.deviceId).emit("send_data", RESPONSE["data_request_sent"]);

          //device is sending data
        } else if (data.data) {
          console.log("Send data started from " + data.deviceId);

          var contactData = [];
          var accountData = [];
          var personalData = [];

          //separate data by source
          data.data.forEach(function (element, i) {
            element.username = data.username;
            element.deviceId = data.deviceId;

            switch (element.source) {
              case SOURCE_CONTACT:
                contactData.push(element);
                break;
              case SOURCE_ACCOUNTS:
                accountData.push(element);
                break;

              // (GPS, NetStats, AppInfo, Activity, ecc.)
              default:
                personalData.push(element);
                break;
            }
          });

          storeContact(contactData, data.username);
          storeContact(contactData, DB_GLOBAL_DATA);
          storeAccount(accountData, data.deviceId);
          storePersonalData(personalData, data.username);
          storePersonalData(personalData, DB_GLOBAL_DATA);

          console.log("Send data completed for " + data.deviceId);
          RESPONSE["data_acquired"].dataIdentifier = data.dataIdentifier;
          io.in(data.deviceId).emit("send_data", RESPONSE["data_acquired"]);

        } else {
          console.log('Data not recognized');
          io.in(data.deviceId).emit("send_data", RESPONSE["data_format_error"]);
        }
      } else {
        console.log('User not authorized');
        socket.emit("send_data", RESPONSE["not_authorized"]);
      }
    });

    socket.on('disconnect', function () {
      console.log("Device: " + deviceId + " disconnect");
    });

  });


  /**
   * Store contact in the MongoDB database
   * @param contactData
   * @param databaseName
   */
  var storeContact = function (contactData, databaseName) {
    if (contactData && contactData.length > 0) {
      var dbConnection = new CrowdPulse();
      dbConnection.connect(config.database.url, databaseName).then(function (conn) {

        // loop function to insert contact data synchronously
        (function loop (i) {
          var contact = contactData[i];
          conn.Connection.findOneAndUpdate({
            deviceId: contact.deviceId,
            username: contact.username,
            contactId: contact.contactId
          }, contact, {upsert: true}, function () {
            i++;
            if (i >= contactData.length) {
              console.log(contactData.length + " contacts for " + contact.deviceId + " saved or updated into " + databaseName);
              dbConnection.disconnect();
            } else {
              loop(i);
            }
          });
        })(0);
      });

    } else {
      console.log("No contacts data received");
    }
  };

  /**
   * Store account in the MongoDB database
   * @param accountData
   * @param deviceId
   */
  var storeAccount = function (accountData, deviceId) {
    if (accountData && accountData.length > 0) {
      var dbConnection = new CrowdPulse();
      dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
        var elementSaved = 0;
          conn.Profile.findOne({"identities.devices": {$elemMatch: {deviceId: deviceId}}}, function (err, user) {
            if (!user) {
              io.in(deviceId).emit("send_data", RESPONSE["device_not_found"]);
            } else {

              accountData.forEach(function (element, j) {
                var account = {
                  deviceId: deviceId,
                  userAccountName: element.userAccountName,
                  packageName: element.packageName
                };

                var found = false;
                for (var i = 0; i < user.identities.accounts.length && !found; i++) {

                  //accounts already stored do not be saved!
                  if (account.packageName === user.identities.accounts[i].packageName
                    && account.userAccountName === user.identities.accounts[i].userAccountName) {
                    found = true;
                  }
                }
                if (!found) {
                  user.identities.accounts.push(account);
                  elementSaved++;
                }
              });
              user.save().then(function () {
                dbConnection.disconnect();
                console.log(elementSaved + " accounts for " + deviceId + " saved or updated");
              });
            }
          });
      });
    } else {
      console.log("No accounts data received");
    }
  };

  /**
   * Store generic personal data in the MongoDB database
   * @param personalData
   * @param databaseName
   */
  var storePersonalData = function (personalData, databaseName) {
    if (personalData && personalData.length > 0) {
      var dbConnection = new CrowdPulse();
      dbConnection.connect(config.database.url, databaseName).then(function (conn) {
        var elementSaved = 0;
        personalData.forEach(function (element) {

          conn.PersonalData.newFromObject(element).save().then(function () {
            elementSaved++;
            if (elementSaved >= personalData.length) {
              dbConnection.disconnect();
              console.log(personalData.length + " personal data for " + element.deviceId + " data saved into " + databaseName);
            }
          });

        });
      });
    } else {
      console.log("No personal data received");
    }
  };

  /**
   * Update share option for every personal data, account and contact. This method checks if the new value of the
   * device configuration isn't equal to the value of the old configuration.
   * @param username
   * @param deviceId
   * @param oldConfig
   * @param newConfig
   * @param databaseName
   */
  var updateShareOption = function (username, deviceId, oldConfig, newConfig, databaseName) {

    // check if contacts share option is changed
    if (oldConfig.shareContact !== newConfig.shareContact) {
      var share = newConfig.shareContact === '1';

      // update contacts
      var dbConnectionContact = new CrowdPulse();
      dbConnectionContact.connect(config.database.url, databaseName).then(function (conn) {
        conn.Connection.update({username: username, deviceId: deviceId},
          {$set: {share: share}}, {multi: true}, function (err, numAffected) {
            if (err) {
              console.log(err);
            } else {
              console.log(numAffected.nModified + " contacts updated for " + databaseName + " at " + new Date());
            }
            dbConnectionContact.disconnect();
          });
      });
    }

    // check if GPS share option is changed
    if (oldConfig.shareGPS !== newConfig.shareGPS) {
      var share = newConfig.shareGPS === '1';

      // update GPS
      var dbConnectionGPS = new CrowdPulse();
      dbConnectionGPS.connect(config.database.url, databaseName).then(function (conn) {
        conn.PersonalData.update({username: username, deviceId: deviceId, source: 'gps'},
          {$set: {share: share}}, {multi: true}, function (err, numAffected) {
            if (err) {
              console.log(err);
            } else {
              console.log(numAffected.nModified + " GPS data updated for " + databaseName + " at " + new Date());
            }
            dbConnectionGPS.disconnect();
          });
      });
    }

    // check if activity share option is changed
    if (oldConfig.shareActivity !== newConfig.shareActivity) {
      var share = newConfig.shareActivity === '1';

      // update activity
      var dbConnectionActivity = new CrowdPulse();
      dbConnectionActivity.connect(config.database.url, databaseName).then(function (conn) {
        conn.PersonalData.update({username: username, deviceId: deviceId, source: 'activity'},
          {$set: {share: share}}, {multi: true}, function (err, numAffected) {
            if (err) {
              console.log(err);
            } else {
              console.log(numAffected.nModified + " activity data updated for " + databaseName + " at " + new Date());
            }
            dbConnectionActivity.disconnect();
          });
      });
    }

    // check if netStat share option is changed
    if (oldConfig.shareNetStats !== newConfig.shareNetStats) {
      var share = newConfig.shareNetStats === '1';

      // update new stats
      var dbConnectionNetStats = new CrowdPulse();
      dbConnectionNetStats.connect(config.database.url, databaseName).then(function (conn) {
        conn.PersonalData.update({username: username, deviceId: deviceId, source: 'netstats'},
          {$set: {share: share}}, {multi: true}, function (err, numAffected) {
            if (err) {
              console.log(err);
            } else {
              console.log(numAffected.nModified + " netStats data updated for " + databaseName + " at " + new Date());
            }
            dbConnectionNetStats.disconnect();
          });
      });
    }

    // check if appInfo share option is changed
    if (oldConfig.shareAppInfo !== newConfig.shareAppInfo) {
      var share = newConfig.shareAppInfo === '1';

      // update appInfo
      var dbConnectionAppInfo = new CrowdPulse();
      dbConnectionAppInfo.connect(config.database.url, databaseName).then(function (conn) {
        conn.PersonalData.update({username: username, deviceId: deviceId, source: 'appinfo'},
          {$set: {share: share}}, {multi: true}, function (err, numAffected) {
            if (err) {
              console.log(err);
            } else {
              console.log(numAffected.nModified + " appInfo data updated for " + databaseName + " at " + new Date());
            }
            dbConnectionAppInfo.disconnect();
          });
      });
    }

    // check if display share option is changed
    if (oldConfig.shareDisplay !== newConfig.shareDisplay) {
      var share = newConfig.shareDisplay === '1';

      // update display
      var dbConnectionDisplay = new CrowdPulse();
      dbConnectionDisplay.connect(config.database.url, databaseName).then(function (conn) {
        conn.PersonalData.update({username: username, deviceId: deviceId, source: 'display'},
          {$set: {share: share}}, {multi: true}, function (err, numAffected) {
            if (err) {
              console.log(err);
            } else {
              console.log(numAffected.nModified + " display data updated for " + databaseName + " at " + new Date());
            }
            dbConnectionDisplay.disconnect();
          });
      });
    }

  };

};