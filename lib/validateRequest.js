var jwt = require('jsonwebtoken');
var config = require('../config.json');
var databaseName = require('../crowd-pulse-data/databaseName');

module.exports = function(req, res, next) {

  // show run logs (for old web-ui)
  if (req.originalUrl.startsWith('/api/projects') && req.originalUrl.indexOf('log') !== -1) {
    return next();
  }

  // reading access token to access API
  var token = (req.body && req.body.access_token) || (req.query && req.query.access_token) || req.headers['x-access-token'];

  if (token) {
    jwt.verify(token, config.session.secret, function(err, decoded) {
      if (err) {
        res.status(500);
        res.json({
          auth: false,
          message: 'Failed to authenticate token. ' + err.message
        });
      } else {

        // set session variable
        req.session = decoded;

        // hide stats endpoints for not owner users
        if (req.query.db && req.session.username !== 'admin'
            && req.query.db !== req.session.username
            && req.query.db !== databaseName.globalData
            && req.query.db !== databaseName.profiles) {

          res.status(401);
          res.json({
            auth: true,
            message: 'You do not have the required permissions.'
          });
          return;
        }

        // go to next middleware
        next();
      }
    });
  } else {
    res.status(401);
    res.json({
      "status": 401,
      "message": "Invalid Token",
      "token": token
    });
  }
};