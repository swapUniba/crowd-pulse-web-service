'use strict';

var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var TagSchema = builder(schemas.tag, {
  sources: [String],
  language: String,
  categories: [schemas.category],
  stopWord: Boolean
});

module.exports = TagSchema;
