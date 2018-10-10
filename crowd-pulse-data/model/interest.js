'use strict';

var InterestSchema = require('./../schema/interest');

module.exports = function(mongoose) {
  return mongoose.model(InterestSchema.statics.getSchemaName(), InterestSchema);
};