'use strict';

var UserSchema = require('./../schema/user');

module.exports = function(mongoose) {
  return mongoose.model(UserSchema.statics.getSchemaName(), UserSchema);
};