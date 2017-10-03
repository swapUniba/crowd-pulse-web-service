'use strict';

var Q = require('q');

var getAddAppMaybeFn = function(crowdPulse) {
  return function(app) {
    console.log('Bootstrapping application', app.name + '...');
    return crowdPulse.App.findOne({name: app.name}).exec()
      .then(function(existingApp) {
        console.log('Application', app.name,
          (existingApp ? 'already existed.' : 'doesn\'t exist, creating it now....'));
        return existingApp || crowdPulse.App.create(app);
      })
      .then(function(app) {
        console.log('Bootstrapped application', app.name + '.');
      });
  };
};

var getAddUserMaybeFn = function(crowdPulse) {
  return function(user) {
    return crowdPulse.User.findOne({username: user.username}).exec()
      .then(function(existingUser) {
        console.log('User', user.username,
          (existingUser ? 'already existed.' : 'doesn\'t exist, creating it now....'));
        return existingUser || crowdPulse.User.create(user);
      })
      .then(function(user) {
        console.log('Bootstrapped user', user.username + '.');
      });
  }
};

var bootstrapMaybe = function(crowdPulse, config) {
  return function() {
    if (config.bootstrap !== true) {
      return true;
    }
    var appPromises = (config.apps || []).map(getAddAppMaybeFn(crowdPulse));
    var userPromises = (config.users || []).map(getAddUserMaybeFn(crowdPulse));
    return Q.all(appPromises.concat(userPromises))
      .then(function() {
        console.log('Bootstrap completed.');
        return true;
      });
  }
};

module.exports = bootstrapMaybe;