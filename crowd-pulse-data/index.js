'use strict';

var Q = require('q');
var mongoose = require('mongoose');

// use Q as Promise library
mongoose.Promise = Q.Promise;

var DataLayer = function() {
  var self = this;

  self.connect = function(host, database, port, options, callback) {
    var deferred = Q.defer();

    self.connection = mongoose.createConnection('mongodb://' + host + "/" + database);

    self.connection.on('error', function(err) {
      deferred.reject(err);
    });

    self.connection.once('open', function() {
      // create models bound to the current connection
      self.AccessToken = require('./model/accessToken')(self.connection);
      self.App = require('./model/app')(self.connection);
      self.Project = require('./model/project')(self.connection);
      self.ProjectRun = require('./model/projectRun')(self.connection);
      self.RefreshToken = require('./model/refreshToken')(self.connection);
      self.User = require('./model/user')(self.connection);
      self.Message = require('./model/message')(self.connection);
      self.Profile = require('./model/profile')(self.connection);
      self.PersonalData = require('./model/personalData')(self.connection);
      self.Interest = require('./model/interest')(self.connection);
      self.Connection = require('./model/connection')(self.connection);
      self.Like = require('./model/like')(self.connection);
      self.ObjectId = mongoose.Types.ObjectId;

      // return the whole object
      deferred.resolve(self);
    });

    return deferred.promise;
  };

  self.disconnect = function() {
    return Q.ninvoke(self.connection, 'close');
  };

  self.getDatabases = function() {
    var admin = self.connection.db.admin();
    return Q.ninvoke(admin, 'listDatabases')
      .then(function(result) {
        return result.databases;
      });
  };

  self.initDatabase = function() {
    var appInit = self.App.findOne({name: 'testApp'})
      .then(function(result) {
        return result || self.App.createQ({
            name: 'testApp',
            secret: 'yolo123',
            allowedGrants: ['authorization_code', 'password', 'refresh_token', 'client_credentials']
          });
      });

    var userInit = self.User.findOne({username: 'admin'})
      .then(function(result) {
        return result || self.User.createQ({
            username: 'admin',
            email: 'francescopontillo@gmail.com',
            secret: 'yolo'
          });
      });

    return Q.all(appInit, userInit);
  };
};

module.exports = DataLayer;