'use strict';

var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var InterestSchema = builder(schemas.token, {
  id: mongoose.Schema.ObjectId,
  oId: String,
  source: String,
  timestamp: Number,
  confidence: Number
});

module.exports = InterestSchema;

// Model methods

InterestSchema.statics.newFromObject = function(object) {
  return new this(object);
};