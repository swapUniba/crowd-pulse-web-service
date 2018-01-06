'use strict';

var router = require('express').Router();
var request = require('request');
var qs = require('querystring');
var CrowdPulse = require('./../crowd-pulse-data');
var config = require('./../lib/config');

const CLIENT_ID = '77kw2whm8zdmzr';
const CLIENT_SECRET = 'IgFP60GaF2Sa8jzD';
const PERMISSION = ['r_basicprofile', 'r_emailaddress', 'rw_company_admin', 'w_share'];

const API_LOGIN_DIALOG = 'https://www.linkedin.com/oauth/v2/authorization';
const API_ACCESS_TOKEN =  'https://www.linkedin.com/oauth/v2/accessToken';
const API_PEOPLE = 'https://api.linkedin.com/v1/people/~:(id,first-name,last-name,email-address,picture-url,location,' +
  'industry,num-connections,summary,specialties,positions,associations,interests,patents,skills,certifications,' +
  'educations,courses,volunteer,num-recommenders,following,date-of-birth,honors-awards)';


module.exports = function() {

  /**
   * Creates a login dialog URL.
   * Params:
   *    callbackUrl - the url send to LinkedIn as callback
   */
  router.route('/linkedin/login_dialog')
    .post(function (req, res) {
      try {
        var params = {
          response_type: 'code',
          client_id: CLIENT_ID,
          redirect_uri: req.body.callbackUrl,
          state: 'state',
          scope: PERMISSION.join(',')
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
   *    code - the authorization code returned by LinkedIn after user login
   *    callbackUrl - the url send to LinkedIn as callback
   */
  router.route('/linkedin/request_token')
    .post(function (req, res) {
      try {
        var params = {
          code: req.body.code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: req.body.callbackUrl,
          grant_type: 'authorization_code'
        };

        request.post(API_ACCESS_TOKEN, { form: params, json: true }, function(err, response, body) {
          if (response.statusCode !== 200) {
            res.sendStatus(500);
          } else {

            // TODO save access token in the database

            res.status(200);
            res.json({
              accessToken: body.access_token,
              expiresIn: body.expires_in
            });
          }
        });
      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }
    });


  /**
   * Get LinkedIn user profile information.
   * Params:
   *    accessToken - obtained after the user request
   */
  router.route('/linkedin/profile')
    .post(function (req, res) {
      try {
        var params = {
          oauth2_access_token: req.body.accessToken,
          format: 'json'
        };
        request.get({url: API_PEOPLE, qs: params, json: true}, function (err, response, profile) {

          // TODO save profile data
          console.log(profile);

        });

      } catch(err) {
        console.log(err);
        res.sendStatus(500);
      }

    });


  return router;
};