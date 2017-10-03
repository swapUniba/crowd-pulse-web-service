'use strict';

var ProjectSchema = require('./../schema/project');

module.exports = function(mongoose) {
  return mongoose.model(ProjectSchema.statics.getSchemaName(), ProjectSchema);
};