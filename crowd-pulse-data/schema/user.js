'use strict';

var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var UserSchema = builder(schemas.user, {
  id: mongoose.Schema.ObjectId,
  username: String,
  email: String,
  secret: String
});

UserSchema.statics.findOneIdByNameSecret = function (username, secret, callback) {
  return this.model(schemas.user).findOne({ username: username }).exec()
    .then(function(user) {
      var foundUserId;
      // TODO: implement hashing system
      if (user.secret === secret) {
        foundUserId = user._id;
      }
      if (callback) {
        return callback(undefined, foundUserId);
      }
      return foundUserId;
    });
};

module.exports = UserSchema;