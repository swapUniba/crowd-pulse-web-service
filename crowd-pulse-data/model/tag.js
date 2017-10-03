'use strict';

var mongoose = require('mongoose');
var TagSchema = require('./../schema/tag');

module.exports = mongoose.model(TagSchema.statics.getSchemaName(), TagSchema);