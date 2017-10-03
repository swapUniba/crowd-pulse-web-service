'use strict';

var qSend = require('../lib/expressQ').send;
var qErr = require('../lib/expressQ').error;
var router = require('express').Router();
var CrowdPulse = require('./../crowd-pulse-data');
var config = require('./../lib/config');

module.exports = function() {

  router.route('/terms')
    // /api/terms?db=sexism&type=tag&term=searchthisword
    .get(function(req, res) {
      var dbConn = new CrowdPulse();
      return dbConn.connect(config.database.url, req.query.db)
        .then(function(conn) {
          return conn.Message.searchTerm(req.query.type, req.query.term);
        })
        .then(function(objects) {
          return objects.map(function(item) {
            return item._id;
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