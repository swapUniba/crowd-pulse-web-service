'use strict';

var MessageSchema = require('./../schema/message');

module.exports = function(mongoose) {
  return mongoose.model(MessageSchema.statics.getSchemaName(), MessageSchema);
};