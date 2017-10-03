'use strict';

var ProjectRunSchema = require('./../schema/projectRun');

module.exports = function(mongoose) {
  return mongoose.model(ProjectRunSchema.statics.getSchemaName(), ProjectRunSchema);
};