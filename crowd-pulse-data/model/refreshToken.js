'use strict';

var OAuthAccessRefreshSchema = require('./../schema/refreshToken');

module.exports = function(mongoose) {
  return mongoose.model(OAuthAccessRefreshSchema.statics.getSchemaName(), OAuthAccessRefreshSchema);
};