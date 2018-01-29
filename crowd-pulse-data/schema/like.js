'use strict';

var Q = require('q');
var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var LikeSchema = builder(schemas.like, {
  id: mongoose.Schema.ObjectId,
  oId: String,
  source: String,
  fromUser: String,
  name: String,
  category: String,
  date: Date
});

LikeSchema.statics.newFromObject = function(object) {
  return new this(object);
};

module.exports = LikeSchema;
