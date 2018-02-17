'use strict';

var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var InterestSchema = builder(schemas.token, {
  id: String,
  source: String,
  timestamp: Number,
  confidence: Number
});

module.exports = InterestSchema;
