'use strict';

var router = require('express').Router();
var request = require('request');
var qs = require('querystring');
var CrowdPulse = require('./../crowd-pulse-data');
var databaseName = require('./../crowd-pulse-data/databaseName');
var config = require('./../lib/config');
var batch = require('./../lib/batchOperations');


exports.endpoint = function() {

    /**
     * Creates a login dialog URL.
     * Params:
     *    callbackUrl - the url send to Fitbit as callback
     */
    router.route('/fitbit/login_dialog')
        .post(function (req, res) {
            try {
                // TODO
            } catch(err) {
                console.log(err);
                res.sendStatus(500);
            }
        });


    return router;
};
