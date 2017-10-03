'use strict';

var ProfileSchema = require('./../schema/profile');

module.exports = function(mongoose) {
  return mongoose.model(ProfileSchema.statics.getSchemaName(), ProfileSchema);
};