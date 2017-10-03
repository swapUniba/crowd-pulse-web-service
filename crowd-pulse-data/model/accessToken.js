'use strict';

var OAuthAccessTokenSchema = require('./../schema/accessToken');

module.exports = function(mongoose) {
  return mongoose.model(OAuthAccessTokenSchema.statics.getSchemaName(), OAuthAccessTokenSchema);
};