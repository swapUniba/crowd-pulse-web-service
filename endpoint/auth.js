'use strict';

var router = require('express').Router();
var CrowdPulse = require('./../crowd-pulse-data');
var config = require('./../lib/config');
var jwt = require('jsonwebtoken');
var bcrypt = require('bcryptjs');

const DB_PROFILES = "profiles";

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
              res.status(409);
              res.json({
                auth: false,
                message: "Invalid email and/or password."
              });
            } else {
              bcrypt.compare(req.body.password, user.password, function (err, isMatch) {
                if (!isMatch) {
                  res.status(409);
                  res.json({
                    auth: false,
                    message: "Invalid email and/or password."
                  });
                } else {

                  // access token
                  var token = jwt.sign({
                    email: user.email,
                    username: user.username,
                    developer: !!user.applicationDescription
                  }, config.session.secret);

                  res.send({
                    auth: true,
                    token: token,
                    username: user.username,
                    developer: !!user.applicationDescription
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
   * Register a new user (or developer).
   * Params:
   *    username - the username
   *    email - the user email
   *    password - the user password
   *    applicationDescription - developer application description (if any)
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
              conn.Profile.findOne({username: req.body.username}, function (err, username) {
                if (username) {
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
                    username: req.body.username,
                    password: encryptedPassword,
                    applicationDescription: req.body.applicationDescription
                  };

                  // access token
                  var token = jwt.sign({
                    email: user.email,
                    username: user.username,
                    developer: !!user.applicationDescription
                  }, config.session.secret);

                  // save the first generated accessToken for developers
                  if (user.applicationDescription) {
                    user.accessToken = token;
                  }

                  conn.Profile.newFromObject(user).save().then(function () {
                    dbConn.disconnect();
                    res.send({
                      auth: true,
                      token: token,
                      developer: !!user.applicationDescription
                    });
                  });
                }
              });
            }
          });
        });
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });

  return router;
};