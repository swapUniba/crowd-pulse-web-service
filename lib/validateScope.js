var jwt = require('jsonwebtoken');
var config = require('../config.json');

const ROLE_ADMIN = 'admin';
const ROLE_DEVELOPER = 'developer';
const ROLE_USER = 'user';

module.exports = function(req, res, next) {

  var endpoint = req.originalUrl;

  // show run logs (for old web-ui)
  if (endpoint.startsWith('/api/projects') && req.originalUrl.indexOf('log') !== -1) {
    return next();
  }

  // admin can do all
  if (req.session.username.includes(ROLE_ADMIN)) {
    return next();

  } else if (req.session.developer) {

    // hidden API to developers
    if ( endpoint.startsWith('/api/databases')
      || endpoint.startsWith('/api/facebook')
      || endpoint.startsWith('/api/twitter')
      || endpoint.startsWith('/api/linkedin')
      || endpoint.startsWith('/api/stats')
      || endpoint.startsWith('/api/terms')
      || endpoint.startsWith('/api/projects')) {

      res.status(401);
      res.json({auth: false, message: 'You do not have the required permissions.'});
      return;
    }

  } else {

    // hidden API to normal user
    if ( endpoint.startsWith('/api/databases')
      || endpoint.startsWith('/api/terms')
      || endpoint.startsWith('/api/projects')) {

      res.status(401);
      res.json({auth: false, message: 'You do not have the required permissions.'});
      return;
    }
  }

  next();
};