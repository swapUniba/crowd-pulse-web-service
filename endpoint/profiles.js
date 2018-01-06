'use strict';

var qSend = require('../lib/expressQ').send;
var qErr = require('../lib/expressQ').error;
var router = require('express').Router();
var CrowdPulse = require('./../crowd-pulse-data');
var config = require('./../lib/config');

const DB_PROFILES = "profiles";

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


  return router;
};