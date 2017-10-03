'use strict';

var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var CategorySchema = builder(schemas.category, {
  text: String,
  stopWord: Boolean
});

module.exports = CategorySchema;
