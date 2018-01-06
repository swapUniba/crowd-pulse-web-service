'use strict';

var router = require('express').Router();
var request = require('request');
var qs = require('querystring');
var CrowdPulse = require('./../crowd-pulse-data');
var config = require('./../lib/config');

const CLIENT_SECRET = '7ce264e7a782298475830477d9442bc6';
const CLIENT_ID = '637963103055683';

const FIELDS = ['id', 'email', 'first_name', 'last_name', 'link', 'name', 'about', 'age_range', 'birthday',
  'education', 'favorite_athletes', 'favorite_teams', 'gender', 'hometown', 'inspirational_people',
  'interested_in','languages', 'meeting_for', 'political', 'quotes', 'relationship_status', 'religion',
  'sports', 'website', 'work', 'posts.limit(1000)', 'likes.limit(1000)'];

const PERMISSIONS = ['email', 'public_profile', 'user_friends', 'user_likes', 'user_posts'];

const API_ACCESS_TOKEN = 'https://graph.facebook.com/v2.11/oauth/access_token';
const API_LOGIN_DIALOG = 'https://www.facebook.com/v2.11/dialog/oauth';
const API_USER_POSTS = 'https://graph.facebook.com/v2.11/me/feed';
const API_USER_DATA = 'https://graph.facebook.com/v2.11/me?fields=' + FIELDS.join(',');


module.exports = function() {

  /**
   * Creates a login dialog URL.
   * Params:
   *    callbackUrl - the url send to Facebook as callback
   */
  router.route('/facebook/login_dialog')
    .post(function (req, res) {
      try {
        var params = {
          client_id: CLIENT_ID,
          redirect_uri: req.body.callbackUrl,
          state: 'state',
          scope: PERMISSIONS.join(',')
        };
        var loginDialogUrl = API_LOGIN_DIALOG + '?' + qs.stringify(params);
        res.status(200);
        res.json({
          loginDialogUrl: loginDialogUrl
        });
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });


  /**
   * Exchange authorization code for access token.
   * Params:
   *    code - the authorization code returned by Facebook after user login
   *    callbackUrl - the url send to Facebook as callback
   */
  router.route('/facebook/request_token')
    .post(function (req, res) {
      try {
        var params = {
          code: req.body.code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: req.body.callbackUrl
        };

        request.get({ url: API_ACCESS_TOKEN, qs: params, json: true }, function(err, response, accessToken) {

          if (response.statusCode !== 200) {
            res.sendStatus(500);

          } else {

            // TODO save access token in the database

            res.status(200);
            res.json({
              accessToken: accessToken
            });
          }

        });
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });


  /**
   * Get Facebook user profile information.
   * Params:
   *    accessToken - obtained after the user request
   */
  router.route('/facebook/profile')
    .post(function (req, res) {
      try {

        // retrieve profile information about the current user
        request.get({ url: API_USER_DATA, qs: req.body.accessToken, json: true }, function(err, response, profile) {

          if (response.statusCode !== 200) {
            return res.sendStatus(500);
          }

          // TODO save profile data
          console.log(profile.posts.data[0]);
          res.status(200);

        });
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });

  /**
   * Get Facebook user posts.
   * Params:
   *    accessToken - obtained after the user request
   */
  router.route('/facebook/posts')
    .post(function (req, res) {
      try {
        // TODO user access token from db

        // retrieve profile information about the current user
        request.get({ url: API_USER_POSTS, qs: req.body.accessToken, json: true }, function(err, response, posts) {

          if (response.statusCode !== 200) {
            return res.sendStatus(500);
          }

          // TODO save posts data
          console.log(posts);
        });
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });



  return router;
};