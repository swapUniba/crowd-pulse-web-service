'use strict';

var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var TokenSchema = builder(schemas.token, {
  text: String,
  pos: String,
  simplePos: String,
  stopWord: Boolean,
  lemma: String,
  score: Number
});

module.exports = TokenSchema;
