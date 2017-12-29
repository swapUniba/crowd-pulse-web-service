var jwt = require('jsonwebtoken');
var config = require('../config.json');

module.exports = function(req, res, next) {

  // reading access token to access API
  var token = (req.body && req.body.access_token) || (req.query && req.query.access_token) || req.headers['x-access-token'];

  if (token) {
    jwt.verify(token, config.session.secret, function(err, decoded) {
      if (err) {
        res.status(500);
        res.json({
          auth: false,
          message: 'Failed to authenticate token.'
        });
      } else {

        // set session variable
        req.session = decoded;

        // hide stats endpoints for not owner users
        if (req.query.db && req.query.db !== req.session.displayName) {
          res.status(401);
          res.json({
            auth: true,
            message: 'You do not have the required permissions.'
          });
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