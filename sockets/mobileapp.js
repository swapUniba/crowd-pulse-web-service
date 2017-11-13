'use strict';

var Q = require('q');
var bcrypt = require('bcrypt');
var config = require('./../lib/config');
var CrowdPulse = require('./../crowd-pulse-data');

const FAIL = 0;         //code for any failure
const SUCCESS = 1;      //code for any success
const RECEIVING = 2;    //if mobile app is receiving data (eg. configuration from web app)

const DB_PERSONAL_DATA = "personal_data";
const DB_PROFILES = "profiles";
const WEB_UI_CLIENT = "web-ui";

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
        var displayName = null;

        console.log('A user connected: ' + socket.id);

        socket.on('login', function (data) {
            console.log("deviceID: " + data.deviceId);

            if (data.deviceId) {
                var dbConnection = new CrowdPulse();
                dbConnection.connect(config.database.url, DB_PROFILES).then(function (conn) {
                    conn.Profile.findOne({email: data.email}, function (err, user) {
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
                                    displayName = user.displayName;

                                    var deviceData = {
                                        deviceId: data.deviceId,
                                        brand: data.brand,
                                        model: data.model,
                                        sdk: data.sdk,
                                        phoneNumbers: data.phoneNumbers
                                    };

                                    if (user.devices) {
                                        var found = false;
                                        for (var i = 0; i < user.devices.length && !found; i++) {
                                            if (data.deviceId === user.devices[i].deviceId) {
                                                user.devices[i] = deviceData;
                                                found = true;
                                            }
                                        }
                                        if (!found) {
                                            user.devices.push(deviceData);
                                        }
                                    } else {
                                        user.devices = [deviceData];
                                    }

                                    user.save();

                                    deviceId = data.deviceId;
                                    socket.join(deviceId);
                                    RESPONSE["login_success"].displayName = displayName;
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
                dbConnection.connect(config.database.url, DB_PROFILES).then(function(conn) {
                    conn.Profile.findOne({devices: {$elemMatch: { deviceId: deviceId}}}, function (err, user) {
                        if (!user) {
                            socket.emit("config", RESPONSE["device_not_found"]);
                        } else {
                            if (data || data.length > 0) {
                                if (user.deviceConfigs) {
                                    var found = false;
                                    for (var i = 0; i < user.deviceConfigs.length && !found; i++) {
                                        if (deviceId === user.deviceConfigs[i].deviceId) {
                                            user.deviceConfigs[i] = data;
                                            found = true;
                                        }
                                    }
                                    if (!found) {
                                        user.deviceConfigs.push(data);
                                    }
                                } else {
                                    user.deviceConfigs = [data];
                                }
                                user.save();
                                console.log("Configuration updated");

                            } else {

                                //the device is asking for an updated configuration
                                var found = false;
                                for (var i = 0; i < user.deviceConfigs.length && !found; i++) {
                                    if (deviceId === user.deviceConfigs[i].deviceId) {
                                        data = user.deviceConfigs[i];
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
            //TODO IMPORTANT check if deviceId exists for the given displayName
            if ((deviceId && displayName) || (data.deviceId && data.displayName)) {
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
                        element.displayName = data.displayName;
                        element.deviceId = data.deviceId;

                        switch (element.source) {
                            case "contact":
                                contactData.push(element);
                                break;
                            case "accounts":
                                accountData.push(element);
                                break;
                            default:
                                personalData.push(element);
                                break;
                        }
                    });

                    //start the sync event chain
                    storeContact(contactData, data.displayName);
                    storeContact(contactData, DB_PERSONAL_DATA);
                    storeAccount(accountData, data.deviceId);
                    storePersonalData(personalData, data.displayName);
                    storePersonalData(personalData, DB_PERSONAL_DATA);

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

                    //search contact by deviceId, contactId and displayName
                    conn.Connection.findOne({
                            deviceId: element.deviceId,
                            contactId: element.contactId,
                            displayName: element.displayName
                        }, function (err, contact) {
                            if (contact) {
                                contact.phoneNumber = element.phoneNumber;
                                contact.contactName = element.contactName;
                                contact.contactPhoneNumbers = element.contactPhoneNumbers;
                                contact.starred = element.starred;
                                contact.contactedTimes = element.contactedTimes;
                                contact.save();
                            } else {
                                conn.Connection.newFromObject(element).save().then(function () {
                                    elementSaved++;
                                    if (elementSaved >= contactData.length) {
                                        console.log(contactData.length + " contacts for " + element.deviceId + " saved into " + databaseName);
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
                accountData.forEach(function (element, j) {
                    conn.Profile.findOne({devices: {$elemMatch: {deviceId: deviceId}}}, function (err, user) {
                        if (!user) {
                            io.in(deviceId).emit("send_data", RESPONSE["device_not_found"]);
                        } else {
                            var account = {
                                userAccountName: element.userAccountName,
                                packageName: element.packageName
                            };

                            var found = false;
                            for (var i = 0; i < user.accounts.length && !found; i++) {

                                //accounts already stored do not be saved!
                                if (account.packageName === user.accounts[i].packageName
                                    && account.userAccountName === user.accounts[i].userAccountName) {
                                    found = true;
                                }
                            }
                            if (!found) {
                                user.accounts.push(account);
                            }
                            user.save().then(function () {
                                elementSaved++;
                                if (elementSaved >= accountData.length) {
                                    dbConnection.disconnect();
                                    console.log(accountData.length + " accounts for " + deviceId + " saved or updated");
                                }
                            });
                        }
                    });
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