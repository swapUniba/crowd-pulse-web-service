
'use strict';

var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var OAuthAccessTokenSchema = builder(schemas.accessToken, {
  id: mongoose.Schema.ObjectId,
  accessToken: String,
  clientId: String,
  userId: String,
  expires: { type: Date }
});

OAuthAccessTokenSchema.statics.findOneByToken = function (token, callback) {
  return this.model(schemas.accessToken).findOne({ accessToken: token }).exec(callback);
};

module.exports = OAuthAccessTokenSchema;