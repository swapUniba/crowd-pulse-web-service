'use strict';

var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var AppSchema = builder(schemas.app, {
  id: mongoose.Schema.ObjectId,
  name: String,
  secret: String,
  redirectUri: String,
  allowedGrants: [ String ]
});

AppSchema.statics.findByName = function (name) {
  return this.model(schemas.app).find({ name: name }).exec();
};

AppSchema.statics.findOneByIdSecret = function (id, secret, callback) {
  return this.model(schemas.app).findOne({ _id: mongoose.Types.ObjectId(id), secret: secret }).exec(callback);
};

AppSchema.statics.hasAllowedGrant = function (id, grantType, callback) {
  return this.model(schemas.app)
    .findOne({ _id: mongoose.Types.ObjectId(id), allowedGrants: grantType })
    .exec(function(err, res) {
      callback(err, !!res);
    });
};

module.exports = AppSchema;