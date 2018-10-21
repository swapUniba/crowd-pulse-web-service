'use strict';

var qSend = require('../lib/expressQ').send;
var qErr = require('../lib/expressQ').error;
var router = require('express').Router();
var CrowdPulse = require('./../crowd-pulse-data');
var config = require('./../lib/config');

module.exports = function() {

  router.route('/profiles')
    // /api/profiles?db=sexism&username=frapontillo
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

  return router;
};