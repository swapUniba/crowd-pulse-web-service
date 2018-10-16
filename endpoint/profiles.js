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
     *    l - the limit of querying result
     *    fromDate, toDate - temporal filter in date format
     *    c - the specific collection
     *    mode - JSON or JSON-LD
     */
    router.route('/profile/:username')
        .get(function (req, res) {
            // FILTER:
            // Mode
            let mode;

            // Limit (req.query.l):
            let l = 50000000;

            if(req.query.l > 0) {
                l = parseInt(req.query.l);
            }

            // fromDate and toDate (req.query.from and req.query.to):
            let minDate = new Date(-4320000000000000);
            minDate = new Date(minDate.getTime());

            let maxDate = new Date(4320000000000000);
            maxDate = new Date(maxDate.getTime());

            if(req.query.fromDate) {
                minDate = new Date(req.query.fromDate);
            }
            if(req.query.toDate) {
                maxDate = new Date(req.query.toDate);
            }

            // Facet (req.query.c):
            let f = "all";

            if(req.query.f) {
                f = req.query.f;
            }

            if (req.params.username) {
                let dbConn = new CrowdPulse();

                // JSON pattern
                let myData = {
                    "@context": "",
                    user: req.params.username,

                    demographics: {}, // From Profile.demographics collection
                    affects: {}, // From Message (Sentiment + Emotion) collection
                    behaviors: {
                        fromText: {},
                        fromActivity: {}
                    }, // From Message for "fromText" collection and from PersonalData for "fromActivity"
                    cognitiveAspects: {
                        personalities: {},
                        empathies: {}
                    }, // From Profile.personalities and Profile.empathies collection
                    interests: {}, // From Interest collection
                    physicalStates: {
                        heart: {},
                        sleep: {},
                        food: {},
                        body: {}
                    }, // From PersonalData, heart-rate, sleep, food and body
                    socialRelations: {} // From Connection collection
                };

                if (req.query.mode) {
                    mode = req.query.mode;
                }

                if (mode === "jsonld") {
                    myData["@context"] = __dirname + "/ontology/person.jsonld";

                    // Change content-type for JSON-LD
                    res.contentType('application/ld+json');
                }


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

                                if(f === "all" || f === "Demographics") {
                                    // GET USER DEMOGRAPHICS COLLECTION
                                    if (holisticConfig.shareDemographics) {
                                        if (user.demographics) {
                                            myData.demographics = user.demographics;
                                        }
                                    }
                                }
                                dbConn.disconnect();
                            }
                        })
                    })
                    // GET USER PERSONALITIES FROM COGNITIVE ASPECTS COLLECTION
                    .then(function () {
                        if(f === "all" || f === "CognitiveAspects") {
                            if (holisticConfig.shareCognitiveAspects) {
                                return dbConn.connect(config.database.url, DB_PROFILES)
                                    .then(function (connection) {
                                        return connection.Profile.aggregate(
                                            {$match: {username: myData.user}},
                                            {$project: {
                                                    _id: 0,
                                                    personalities: {
                                                        $slice: [{
                                                            $filter: {
                                                                input: "$personalities",
                                                                as: "p",
                                                                cond: {
                                                                    $and: [
                                                                        { $gte: [ "$$p.timestamp", minDate.getTime()/1000 ] },
                                                                        { $lte: [ "$$p.timestamp", maxDate.getTime()/1000 ] }
                                                                    ]}
                                                            }
                                                        }, l/2]
                                                    }
                                                }
                                            }
                                            ).exec((err, profile) => {
                                            if (profile) {
                                                myData.cognitiveAspects.personalities = profile[0]["personalities"];
                                            }
                                        });
                                    })
                                    .finally(function () {
                                        dbConn.disconnect();
                                    })
                            }
                        }
                    })
                    // GET USER EMPATHIES FROM COGNITIVE ASPECTS COLLECTION
                    .then(function () {
                        if(f === "all" || f === "CognitiveAspects") {
                            if (holisticConfig.shareCognitiveAspects) {
                                return dbConn.connect(config.database.url, DB_PROFILES)
                                    .then(function (connection) {
                                        return connection.Profile.aggregate(
                                            {$match: {username: myData.user}},
                                            {$project: {
                                                    _id: 0,
                                                    empathies: {
                                                        $slice: [{
                                                            $filter: {
                                                                input: "$empathies",
                                                                as: "e",
                                                                cond: {
                                                                    $and: [
                                                                        { $gte: [ "$$e.timestamp", minDate.getTime()/1000 ] },
                                                                        { $lte: [ "$$e.timestamp", maxDate.getTime()/1000 ] }
                                                                    ]}
                                                            }
                                                        }, l/2]
                                                    }
                                                }
                                            }
                                            ).exec((err, profile) => {
                                            if (profile) {
                                                myData.cognitiveAspects.empathies = profile[0]["empathies"];
                                            }
                                        });
                                    })
                                    .finally(function () {
                                        dbConn.disconnect();
                                    })
                            }
                        }
                    })
                    // GET USER AFFECTS COLLECTION
                    .then(function () {
                        if(f === "all" || f === "Affects") {
                            if (holisticConfig.shareAffects) {
                                return dbConn.connect(config.database.url, myData.user)
                                    .then(function (connection) {
                                        return connection.Message.find({
                                            date: {$gte: minDate, $lte: maxDate}
                                        }, {
                                            _id: 0,
                                            date: 1,
                                            sentiment: 1,
                                            emotion: 1
                                        }, function (err, profile) {
                                            if (profile) {
                                                myData.affects = profile;
                                            }
                                        }).limit(parseInt(l));
                                    })
                                    .finally(function () {
                                        dbConn.disconnect();
                                    })
                            }
                        }
                    })
                    // GET USER BEHAVIOR FROM MESSAGE COLLECTION
                    .then(function () {
                        if(f === "all" || f === "Behaviors") {
                            if (holisticConfig.shareBehavior) {
                                return dbConn.connect(config.database.url, myData.user)
                                    .then(function (connection) {
                                        return connection.Message.find({
                                            date: {$gte: minDate, $lte: maxDate}
                                        }, {
                                            _id: 0,
                                            text: 1,
                                            latitude: 1,
                                            longitude: 1,
                                            date: 1
                                        }, function (err, profile) {
                                            if (profile) {
                                                myData.behaviors.fromText = profile;
                                            }
                                        }).limit(parseInt(l));
                                    })
                                    .finally(function () {
                                        dbConn.disconnect();
                                    })
                            }
                        }
                    })
                    // GET USER BEHAVIOR FROM PERSONALDATA COLLECTION
                    .then(function () {
                        if(f === "all" || f === "Behaviors") {
                            if (holisticConfig.shareBehavior) {
                                return dbConn.connect(config.database.url, myData.user)
                                    .then(function (connection) {
                                        return connection.PersonalData.find({
                                            source: /fitbit-activity/,
                                            timestamp: {$gte: minDate.getTime()/1000, $lte: maxDate.getTime()/1000}
                                        }, {
                                            _id: 0,
                                            timestamp: 1,
                                            steps: 1,
                                            distance: 1,
                                            floors: 1,
                                            elevation: 1,
                                            minutesSedentary: 1,
                                            minutesLightlyActive: 1,
                                            minutesFairlyActive: 1,
                                            minutesVeryActive: 1,
                                            activityCalories: 1,
                                            nameActivity: 1,
                                            startTime: 1,
                                            description: 1
                                        }, function (err, profile) {
                                            if (profile) {
                                                myData.behaviors.fromActivity = profile;
                                            }
                                        }).limit(parseInt(l));
                                    })
                                    .finally(function () {
                                        dbConn.disconnect();
                                    })
                            }
                        }
                    })
                    // GET USER INTERESTS COLLECTION
                    .then(function () {
                        if(f === "all" || f === "Interests") {
                            if (holisticConfig.shareInterest) {
                                return dbConn.connect(config.database.url, myData.user)
                                    .then(function (connection) {
                                        return connection.Interest.find({
                                            timestamp: {$gte: minDate.getTime()/1000, $lte: maxDate.getTime()/1000}
                                        }, {
                                            _id: 0,
                                            value: 1,
                                            confidence: 1,
                                            timestamp: 1
                                        }, function (err, profile) {
                                            if (profile) {
                                                myData.interests = profile;
                                            }
                                        }).limit(parseInt(l));
                                    })
                                    .finally(function () {
                                        dbConn.disconnect();
                                    })
                            }
                        }
                    })
                    // GET USER PHYSICAL STATE COLLECTION
                    .then(function () {
                        if(f === "all" || f === "PhysicalStates") {
                            if (holisticConfig.sharePhysicalState) {
                                return dbConn.connect(config.database.url, myData.user)
                                    // TAKE HEART-RATE VALUES
                                    .then(function (connection) {
                                        return connection.PersonalData.find({
                                            source: /fitbit-heart/,
                                            timestamp: {$gte: minDate.getTime()/1000, $lte: maxDate.getTime()/1000}
                                        }, {
                                            _id: 0,
                                            timestamp: 1,
                                            restingHeartRate: 1,
                                            peak_minutes: 1,
                                            cardio_minutes: 1,
                                            fatBurn_minutes: 1,
                                            outOfRange_minutes: 1
                                        }, function (err, profile) {
                                            if (profile) {
                                                myData.physicalStates.heart = profile;
                                            }
                                            else myData.physicalStates.heart = "Missing information";
                                        }).limit(parseInt(l));
                                    })
                                    // TAKE SLEEP VALUES
                                    .then(function () {
                                        return dbConn.connect(config.database.url, myData.user)
                                            .then(function (connection) {
                                                return connection.PersonalData.find({
                                                    source: /fitbit-sleep/,
                                                    timestamp: {$gte: minDate.getTime()/1000, $lte: maxDate.getTime()/1000}
                                                }, {
                                                    _id: 0,
                                                    timestamp: 1,
                                                    duration: 1,
                                                    efficiency: 1,
                                                    minutesAfterWakeup: 1,
                                                    minutesAsleep: 1,
                                                    minutesAwake: 1,
                                                    minutesToFallAsleep: 1,
                                                    timeInBed: 1,
                                                }, function (err, profile) {
                                                    if (profile) {
                                                        myData.physicalStates.sleep = profile;
                                                    }
                                                }).limit(parseInt(l));
                                            })
                                    })
                                    // TAKE FOOD VALUES
                                    .then(function () {
                                        return dbConn.connect(config.database.url, myData.user)
                                            .then(function (connection) {
                                                return connection.PersonalData.find({
                                                    source: /fitbit-food/,
                                                    timestamp: {$gte: minDate.getTime()/1000, $lte: maxDate.getTime()/1000}
                                                }, {
                                                    _id: 0,
                                                    timestamp: 1,
                                                    caloriesIn: 1,
                                                    calories: 1,
                                                    carbs: 1,
                                                    fat: 1,
                                                    fiber: 1,
                                                    protein: 1,
                                                    sodium: 1,
                                                    water: 1,
                                                }, function (err, profile) {
                                                    if (profile) {
                                                        myData.physicalStates.food = profile;
                                                    }
                                                }).limit(parseInt(l));
                                            })
                                    })
                                    // TAKE BODY VALUES
                                    .then(function () {
                                        return dbConn.connect(config.database.url, myData.user)
                                            .then(function (connection) {
                                                return connection.PersonalData.find({
                                                    source: /fitbit-body/,
                                                    timestamp: {$gte: minDate.getTime()/1000, $lte: maxDate.getTime()/1000}
                                                }, {
                                                    _id: 0,
                                                    timestamp: 1,
                                                    bodyFat: 1,
                                                    bodyWeight: 1,
                                                    bodyBmi: 1,
                                                    nameBody: 1
                                                }, function (err, profile) {
                                                    if (profile) {
                                                        myData.physicalStates.body = profile;
                                                    }
                                                }).limit(parseInt(l));
                                            })
                                    })
                                    .finally(function () {
                                        dbConn.disconnect();
                                    })
                            }
                        }
                    })
                    // GET USER SOCIAL RELATIONS COLLECTION
                    .then(function () {
                        if(f === "all" || f === "SocialRelations") {
                            if (holisticConfig.shareSocialRelations) {
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
                                        }).limit(parseInt(l));
                                    })
                                    .finally(function () {
                                        dbConn.disconnect();
                                    })
                            }
                        }

                    })
                    .catch(qErr(res))
                    .finally(function () {

                        res.status(200);
                        res.json(myData);

                        dbConn.disconnect();
                    });

            }
            res.status(404);
            res.json({
                auth: true,
                message: 'Username not found.'
            });
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