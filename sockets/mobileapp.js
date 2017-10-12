'use strict';

var bcrypt = require('bcrypt');
var config = require('./../lib/config');

var RESPONSE = {
    "user_not_found": {
        "code": 1,
        "description": "User not found"
    },
    "wrong_password": {
        "code": 2,
        "description": "Wrong password"
    },
    "login_success": {
        "code": 3,
        "description": "Login Ok"
    },
    "not_authorized": {
        "code": 4,
        "description": "User not authorized. Login required."
    },
    "config_acquired": {
        "code": 5,
        "description": "Configuration correctly saved."
    },
    "device_not_found": {
        "code": 6,
        "description": "The deviceID doesn't match any deviceID stored."
    },
    "data_acquired": {
        "code": 7,
        "description": "Data correctly saved."
    },
    "data_format_error": {
        "code": 8,
        "description": "Data format not valid."
    }
};


module.exports = function (io, crowdPulse) {

    io.on('connection', function (socket) {
        var deviceId = null;
        var displayName = null;

        console.log('A user connected: ' + socket.id);

        socket.on('login', function (data) {
            console.log("deviceID: " + data.deviceId);

            if (data.deviceId) {

                crowdPulse.connect(config.database.url, "profiles").then(function (conn) {
                    conn.Profile.findOne({email: data.email}, function (err, user) {
                        if (!user) {
                            console.log("Login failed");
                            socket.emit("login", RESPONSE["user_not_found"]);
                        } else {
                            bcrypt.compare(data.password, user.password, function (err, isMatch) {
                                if (!isMatch) {
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
                crowdPulse.connect(config.database.url, "profiles").then(function(conn) {
                    conn.Profile.findOne({devices: {$elemMatch: { deviceId: deviceId}}}, function (err, user) {
                        if (!user) {
                            socket.emit("config", RESPONSE["device_not_found"]);
                        } else {
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
            if (deviceId) {
                console.log("Send data started from " + deviceId);
                if (data.data) {
                    data.data.forEach(function (element, i) {
                        element.displayName = displayName;
                        element.deviceId = deviceId;

                        if (element.source === "contact") {
                            crowdPulse.Connection.newFromObject(element).save();
                        } else if (element.source === "accounts") {
                            crowdPulse.connect(config.database.url, "profiles").then(function (conn) {
                                conn.Profile.findOne({devices: {$elemMatch: {deviceId: deviceId}}}, function (err, user) {
                                    if (!user) {
                                        io.in(deviceId).emit("send_data", RESPONSE["device_not_found"]);
                                    } else {
                                        var accountData = {
                                            userAccountName: element.userAccountName,
                                            packageName: element.packageName
                                        };
                                        if (user.accounts) {
                                            user.accounts.push(accountData);

                                        } else {
                                            user.accounts = [accountData];
                                        }
                                        user.save();
                                    }
                                });
                            });
                        } else {
                            //TODO connect to specifi crowdpulse database (NOT PROFILES)
                            crowdPulse.PersonalData.newFromObject(element).save();
                        }

                    });

                    io.in(deviceId).emit("send_data", RESPONSE["data_acquired"]);
                } else {
                    console.log('Data not recognized');
                    io.in(deviceId).emit("send_data", RESPONSE["data_format_error"]);
                }
            } else {
                console.log('User not authorized');
                socket.emit("send_data", RESPONSE["not_authorized"]);
            }
        });

    });

};