'use strict';

var LikeSchema = require('./../schema/like');

module.exports = function(mongoose) {
  return mongoose.model(LikeSchema.statics.getSchemaName(), LikeSchema);
};