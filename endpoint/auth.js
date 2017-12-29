'use strict';

var router = require('express').Router();
var CrowdPulse = require('./../crowd-pulse-data');
var config = require('./../lib/config');
var jwt = require('jsonwebtoken');
var bcrypt = require('bcryptjs');

const DB_PROFILES = "profiles";

const TOKEN_EXPIRE = 432000; // five days

module.exports = function() {

  /**
   * Performs the login.
   * Params:
   *    email - the user email
   *    password - the user password
   */
  router.route('/login')
    .post(function (req, res) {
      try {
        var dbConn = new CrowdPulse();
        return dbConn.connect(config.database.url, DB_PROFILES).then(function (conn) {
          return conn.Profile.findOne({email: req.body.email}, function (err, user) {
            if (!user) {
              res.status(401);
              res.json({
                auth: false,
                message: "Invalid email and/or password."
              });
            } else {
              bcrypt.compare(req.body.password, user.password, function (err, isMatch) {
                if (!isMatch) {
                  res.status(401);
                  res.json({
                    auth: false,
                    message: "Invalid email and/or password."
                  });
                } else {
                  var token = jwt.sign({email: user.email, displayName: user.displayName},
                    config.session.secret, {expiresIn: TOKEN_EXPIRE});
                  res.send({
                    auth: true,
                    token: token
                  });
                }
              });
            }
          });
        }).finally(function () {
          dbConn.disconnect();
        });
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });

  /**
   * Register a new user.
   * Params:
   *    username - the username
   *    email - the user email
   *    password - the user password
   */
  router.route('/signup')
    .post(function (req, res) {
      try {
        var dbConn = new CrowdPulse();
        return dbConn.connect(config.database.url, DB_PROFILES).then(function (conn) {
          return conn.Profile.findOne({email: req.body.email}, function (err, userEmail) {
            if (userEmail) {
              res.status(409);
              res.json({
                auth: false,
                message: 'Email is already taken'
              });
            } else {
              conn.Profile.findOne({displayName: req.body.displayName}, function (err, userDisplayName) {
                if (userDisplayName) {
                  res.status(409);
                  res.json({
                    auth: false,
                    message: 'Username is already taken'
                  });
                } else {

                  // encrypt password
                  var salt = bcrypt.genSaltSync(10);
                  var encryptedPassword = bcrypt.hashSync(req.body.password, salt);
                  var user = {
                    email: req.body.email,
                    displayName: req.body.displayName,
                    password: encryptedPassword
                  };
                  conn.Profile.newFromObject(user).save().then(function () {
                    var token = jwt.sign({email: user.email}, config.session.secret, {expiresIn: TOKEN_EXPIRE});
                    res.send({
                      auth: true,
                      token: token
                    });
                  });
                }
              });
            }
          });
        }).finally(function () {
          dbConn.disconnect();
        });
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });

  return router;
};