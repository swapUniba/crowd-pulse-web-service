'use strict';

var Q = require('q');
var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var ProjectRunSchema = builder(schemas.projectRun, {
  id: mongoose.Schema.ObjectId,
  dateStart: Date,
  dateEnd: Date,
  log: String,
  status: Number,
  pid: Number
});

ProjectRunSchema.statics.getById = function(id) {
  return Q(this.findById(id).exec());
};

ProjectRunSchema.statics.stopRun = function(runId) {
  return Q(this.findByIdAndUpdate(runId, {$set: {
    status: 0,
    dateEnd: new Date()
  }}, {new: true}).exec());
};

module.exports = ProjectRunSchema;
