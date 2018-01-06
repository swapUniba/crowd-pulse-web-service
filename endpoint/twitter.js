'use strict';

var router = require('express').Router();
var request = require('request');
var qs = require('querystring');
var CrowdPulse = require('./../crowd-pulse-data');
var config = require('./../lib/config');

const CONSUMER_KEY = 'UwKgjmP3nkgswMi18fFRMO5Kc';
const CONSUMER_SECRET = 'gJ0NEoKovmNum8AXb9zstwYCcdU8WqUK0GnTrWx9kXWeFYSCAX';

const API_REQUEST_TOKEN = 'https://api.twitter.com/oauth/request_token';
const API_ACCESS_TOKEN = 'https://api.twitter.com/oauth/access_token';
const API_AUTHENTICATION = 'https://api.twitter.com/oauth/authenticate';
const API_TIMELINE = 'https://api.twitter.com/1.1/statuses/user_timeline.json';

module.exports = function() {

  /**
   * Obtain a request token.
   * Params:
   *    callbackUrl - the url send to Twitter as callback
   */
  router.route('/twitter/request_token')
    .post(function (req, res) {
      try {
        var oauth = {
          consumer_key: CONSUMER_KEY,
          consumer_secret: CONSUMER_SECRET,
          callback: req.body.callback
        };
        request.post({url: API_REQUEST_TOKEN, oauth: oauth}, function (error, response, body) {
          var authData = qs.parse(body);
          var url = API_AUTHENTICATION + '?' + qs.stringify({oauth_token: authData.oauth_token});
          if (authData.oauth_callback_confirmed === 'true') {
            res.status(200);
            res.json({
              auth: true,
              redirectUrl: url
            });
          } else {
            res.sendStatus(500);
          }
        });
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });

  /**
   * Render the request token into a usable access token.
   * Params:
   *    oauthToken - obtained after the user authentication
   *    oauthVerifier - obtained after the user authentication
   */
  router.route('/twitter/access_token')
    .post(function (req, res) {
      var oauth = {
        consumer_key: CONSUMER_KEY,
        consumer_secret: CONSUMER_SECRET,
        token: req.body.oauthToken,
        verifier: req.body.oauthVerifier
      };
      request.post({url: API_ACCESS_TOKEN, oauth: oauth}, function (error, response, body) {
        var oauthData = qs.parse(body);

        // TODO save oauthData and reuse for future api call

        res.status(200);

        // TODO temporary code, delete here
        res.json({
          oauthToken: oauthData.oauth_token,
          oauthTokenSecret: oauthData.oauth_token_secret
        });
      });
    });

  /**
   * Gets the user timeline.
   * Params:
   *    oauthToken - obtained after the access token request
   *    oauthTokenSecret - obtained after the access token request
   */
  router.route('/twitter/user_timeline')
    .post(function (req, res) {

      // TODO get ouathToken from the database

      var oauth = {
        consumer_key: CONSUMER_KEY,
        consumer_secret: CONSUMER_SECRET,
        token: req.body.oauthToken,             // TODO delete here, get from DB if any
        token_secret: req.body.oauthTokenSecret // TODO delete here, get from DB if any
      };

      request.get({url: API_TIMELINE, oauth: oauth, json:true}, function (error, response, tweets) {
        console.log(tweets);
        res.status(200);
      });

      // TODO delete this code
      /*
      var url = 'https://api.twitter.com/1.1/users/show.json';
      var params = {
        screen_name: oauthData.screen_name,
        user_id: oauthData.user_id
      };
      request.get({url:url, oauth:oauth, qs:params, json:true}, function (err, response, user) {
        console.log(user)
      }) */
    });


  return router;
};