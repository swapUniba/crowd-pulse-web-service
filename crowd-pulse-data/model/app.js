'use strict';

var AppSchema = require('./../schema/app');

module.exports = function(mongoose) {
  return mongoose.model(AppSchema.statics.getSchemaName(), AppSchema);
};