'use strict';

var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var OAuthRefreshTokenSchema = builder(schemas.refreshToken, {
  id: mongoose.Schema.ObjectId,
  refreshToken: String,
  clientId: String,
  user: String,
  expires: Date
});

OAuthRefreshTokenSchema.statics.findOneByToken = function (token, callback) {
  return this.model(schemas.refreshToken).findOne({ refreshToken: token }).exec(callback);
};

module.exports = OAuthRefreshTokenSchema;