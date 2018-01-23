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
              if (data || data.length > 0) {
                if (user.identities.configs.devicesConfig) {
                  var found = false;
                  for (var i = 0; i < user.identities.configs.devicesConfig.length && !found; i++) {
                    if (deviceId === user.identities.configs.devicesConfig[i].deviceId) {
                      user.identities.configs.devicesConfig[i] = data;
                      found = true;
                    }
                  }
                  if (!found) {
                    user.identities.configs.devicesConfig.push(data);
                  }
                } else {
                  user.identities.configs.devicesConfig = [data];
                }
                user.save().then(function () {
                  dbConnection.disconnect();
                });
                console.log("Configuration updated");

              } else {

                //the device is asking for an updated configuration
                var found = false;
                for (var i = 0; i < user.identities.configs.devicesConfig.length && !found; i++) {
                  if (deviceId === user.identities.configs.devicesConfig[i].deviceId) {
                    data = user.identities.configs.devicesConfig[i];
                    found = true;
                  }
                }
              }

              RESPONSE["config_acquired"].config = data;

              //new configuration coming from web ui
              if (data.client === WEB_UI_CLIENT) {
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
        var elementSaved = 0;
        contactData.forEach(function (element) {

          //search contact by deviceId, contactId and username
          conn.Connection.findOne({
            deviceId: element.deviceId,
            contactId: element.contactId,
            username: element.username
          }, function (err, contact) {
            if (contact) {
              contact.phoneNumber = element.phoneNumber;
              contact.contactName = element.contactName;
              contact.contactPhoneNumbers = element.contactPhoneNumbers;
              contact.starred = element.starred;
              contact.contactedTimes = element.contactedTimes;
              contact.save().then(function () {
                elementSaved++;
                if (elementSaved >= contactData.length) {
                  console.log(contactData.length + " contacts for " + element.deviceId + " saved or updated into " + databaseName);
                  dbConnection.disconnect();
                }
              });
            } else {
              conn.Connection.newFromObject(element).save().then(function () {
                elementSaved++;
                if (elementSaved >= contactData.length) {
                  console.log(contactData.length + " contacts for " + element.deviceId + " saved or updated into " + databaseName);
                  dbConnection.disconnect();
                }
              });
            }

          });
        });
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
                }
                user.save().then(function () {
                  elementSaved++;
                  if (elementSaved >= accountData.length) {
                    dbConnection.disconnect();
                    console.log(accountData.length + " accounts for " + deviceId + " saved or updated");
                  }
                });
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
    var dbConnection = new CrowdPulse();
    if (personalData && personalData.length > 0) {

      dbConnection.connect(config.database.url, databaseName).then(function (conn) {
        var elementSaved = 0;
        personalData.forEach(function (element) {

          conn.PersonalData.newFromObject(element).save().then(function () {
            elementSaved++;
            if (elementSaved >= personalData.length) {
              console.log(personalData.length + " personal data for " + element.deviceId + " data saved into " + databaseName);
            }
          });

        });
      });
    } else {
      console.log("No personal data received");
    }
  };

};