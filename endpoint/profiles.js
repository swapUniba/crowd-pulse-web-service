'use strict';

var qSend = require('../lib/expressQ').send;
var qErr = require('../lib/expressQ').error;
var router = require('express').Router();
var CrowdPulse = require('./../crowd-pulse-data');
var config = require('./../lib/config');

const DB_PROFILES = "profiles";

module.exports = function() {

    /**
     * Get the graph profiles
     * Params:
     *    db - the database name
     *    username - the user name
     */
    router.route('/profiles')
    // /api/profiles?db=profile&username=rstanziale
        .get(function(req, res) {
            var dbConn = new CrowdPulse();
            return dbConn.connect(config.database.url, req.query.db)
                .then(function(conn) {
                    return conn.Profile.search(req.query.username);
                })
                .then(function(objects) {
                    return objects.map(function(item) {
                        return item.username;
                    });
                })
                .then(qSend(res))
                .catch(qErr(res))
                .finally(function() {
                    dbConn.disconnect();
                });
        });

    /**
     * Get the authenticated logged user.
     * Params:
     *    username - the user name
     */
    router.route('/user')
        .post(function(req, res) {
            if (req.body.username !== req.session.username) {
                res.status(401);
                res.json({
                    auth: false,
                    message: 'You do not have the required permissions.'
                });
            } else {
                var dbConn = new CrowdPulse();
                return dbConn.connect(config.database.url, DB_PROFILES)
                    .then(function (conn) {
                        return conn.Profile.findOne({username: req.body.username}, function (err, user) {
                            if (user) {
                                return user;
                            } else {
                                res.status(404);
                                res.json({
                                    auth: true,
                                    message: 'Username not found.'
                                });
                            }
                        });
                    })
                    .then(qSend(res))
                    .catch(qErr(res))
                    .finally(function () {
                        dbConn.disconnect();
                    });
            }
        });

    /**
     * Get public information associated with a user's profile (including holistic profile data).
     * Params:
     *    username - the user name
     *    mode - JSON or RDF
     */
    router.route('/profile/:username')
        .get(function(req, res) {
            if (req.params.username) {
                let dbConn = new CrowdPulse();

                // JSON pattern
                let myData = {
                    user : req.params.username,

                    demographics : "Information not shared by the user", // From Profile.demographics collection
                    affects : "Information not shared by the user", // From Message (Sentiment + Emotion) collection
                    behavior : "Information not shared by the user", // From Message (Long e Lat) collection
                    cognitiveAspects : "Information not shared by the user", // From Profile.personalities and Profile.empathies collection
                    interest : "Information not shared by the user", // From Interest collection
                    physicalState : "Information not shared by the user", // From PersonalData, heart-rate and sleep
                    socialRelations : "Information not shared by the user" // From Connection collection
                };

                // Save holistic configuration from user's profile
                let holisticConfig = null;

                // Use multiple connections like this
                return dbConn.connect(config.database.url, DB_PROFILES)
                    .then(function (conn) {
                        return conn.Profile.findOne({username: req.params.username}, function (err, user) {
                            if (user) {

                                // Get user configuration
                                holisticConfig = user.identities.configs.holisticProfileConfig;

                                // Get username
                                myData.user = req.params.username;

                                // GET USER DEMOGRAPHICS COLLECTION
                                if (holisticConfig.shareDemographics) {
                                    if (user.demographics) {
                                        myData.demographics = user.demographics;
                                    }
                                    else myData.demographics = "Missing information";
                                }

                                // GET USER COGNITIVE ASPECTS COLLECTION
                                //TODO Add empathies values
                                if (holisticConfig.shareCognitiveAspects) {
                                    if (user.personalities) {
                                        myData.cognitiveAspects = user.personalities;
                                    }
                                    else myData.cognitiveAspects = "Missing information";
                                }

                                dbConn.disconnect();
                            }
                        });
                    })
                    // GET USER AFFECTS COLLECTION
                    .then(function () {
                        if (holisticConfig.shareAffects) {
                            return dbConn.connect(config.database.url, myData.user)
                                .then(function(connection) {
                                    return connection.Message.find({}, {
                                        _id: 0,
                                        date: 1,
                                        sentiment: 1,
                                        emotion: 1
                                    }, function (err, profile) {
                                        if(profile) {
                                            myData.affects = profile;
                                        }
                                        else myData.affects = "Missing information";
                                    })
                                })
                                .finally(function () {
                                    dbConn.disconnect();
                                })
                        }
                    })
                    // GET USER BEHAVIOR COLLECTION
                    .then(function () {
                        if (holisticConfig.shareBehavior) {
                            return dbConn.connect(config.database.url, myData.user)
                                .then(function (connection) {
                                    return connection.Message.find({}, {
                                        _id: 0,
                                        text: 1,
                                        latitude: 1,
                                        longitude: 1,
                                        date: 1,
                                        fromUser: 1
                                    }, function (err, profile) {
                                        if (profile) {
                                            myData.behavior = profile;
                                        }
                                        else myData.behavior = "Missing information";
                                    })
                                })
                                .finally(function () {
                                    dbConn.disconnect();
                                })
                        }
                    })
                    // GET USER INTERESTS COLLECTION
                    .then(function () {
                        if (holisticConfig.shareInterest) {
                            return dbConn.connect(config.database.url, myData.user)
                                .then(function (connection) {
                                    return connection.Interest.find({}, {
                                        _id: 0,
                                        value: 1,
                                        confidence: 1,
                                        timestamp : 1
                                    }, function (err, profile) {
                                        if (profile) {
                                            myData.interest = profile;
                                        }
                                        else myData.interest = "Missing information";
                                    })
                                })
                                .finally(function () {
                                    dbConn.disconnect();
                                })
                        }
                    })
                    // GET USER PHYSICAL STATE COLLECTION
                    .then(function () {
                        if (holisticConfig.sharePhysicalState) {
                            //TODO USER PHYSICAL STATE (Missing Fitbit integration in this version)
                            return dbConn.connect(config.database.url, myData.user)
                                .then(function (connection) {
                                    return connection.PersonalData.find({}, {

                                    }, function (err, profile) {
                                        if (profile) {
                                            myData.physicalState = profile;
                                        }
                                        else myData.physicalState = "Missing information";
                                    })
                                })
                                .finally(function () {
                                    dbConn.disconnect();
                                })
                        }
                    })
                    // GET USER SOCIAL RELATIONS COLLECTION
                    .then(function () {
                        if(holisticConfig.shareSocialRelations) {
                            return dbConn.connect(config.database.url, myData.user)
                                .then(function (connection) {
                                    return connection.Connection.find({}, {
                                        _id: 0,
                                        contactId: 1,
                                        source: 1
                                    }, function (err, profile) {
                                        if (profile) {
                                            myData.socialRelations = profile;
                                        }
                                        else myData.socialRelations = "Missing information";
                                    })
                                })
                                .finally(function () {
                                    dbConn.disconnect();
                                })
                        }

                    })
                    .catch(qErr(res))
                    .finally(function () {

                        res.status(200);
                        res.json(myData);

                        dbConn.disconnect();
                    });

            } else {
                res.status(404);
                res.json({
                    auth: true,
                    message: 'Username not found.'
                });
            }
        });

    /**
     * Change holistic profile configuration for the logged user.
     * Post params:
     *    username - the user name
     * Get query params:
     *     shareDemographics, shareInterest, shareAffects, shareCognitiveAspects, shareBehavior,
     *     shareSocialRelations, sharePhysicalState
     */
    router.route('/user/config')
        .post(function(req, res) {
            if (req.body.username !== req.session.username) {
                res.status(401);
                res.json({
                    auth: false,
                    message: 'You do not have the required permissions.'
                });
            } else {
                var dbConn = new CrowdPulse();
                return dbConn.connect(config.database.url, DB_PROFILES)
                    .then(function (conn) {
                        return conn.Profile.findOne({username: req.body.username}, function (err, user) {
                            if (user) {
                                var params = req.query;
                                var config = user.identities.configs.holisticProfileConfig;
                                if (params.shareDemographics !== null && params.shareDemographics !== undefined) {
                                    config.shareDemographics = params.shareDemographics;
                                }
                                if (params.shareInterest !== null && params.shareInterest !== undefined) {
                                    config.shareInterest = params.shareInterest;
                                }
                                if (params.shareAffects !== null && params.shareAffects !== undefined) {
                                    config.shareAffects = params.shareAffects;
                                }
                                if (params.shareCognitiveAspects !== null && params.shareCognitiveAspects !== undefined) {
                                    config.shareCognitiveAspects = params.shareCognitiveAspects;
                                }
                                if (params.shareBehavior !== null && params.shareBehavior !== undefined) {
                                    config.shareBehavior = params.shareBehavior;
                                }
                                if (params.shareSocialRelations !== null && params.shareSocialRelations !== undefined) {
                                    config.shareSocialRelations = params.shareSocialRelations;
                                }
                                if (params.sharePhysicalState !== null && params.sharePhysicalState !== undefined) {
                                    config.sharePhysicalState = params.sharePhysicalState;
                                }

                                // save user config
                                user.save().then(function () {
                                    dbConn.disconnect();
                                });
                                res.status(200);
                                res.json({auth: true});

                            } else {
                                dbConn.disconnect();
                                res.status(404);
                                res.json({
                                    auth: true,
                                    message: 'Username not found.'
                                });
                            }
                        });
                    });
            }
        });

    return router;
};