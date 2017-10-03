'use strict';

var Q = require('q');
var mongoose = require('mongoose');

module.exports = function(name, schema) {

  var TheSchema = new mongoose.Schema(schema);
  TheSchema.statics.getSchemaName = function() {
    return name;
  };
  TheSchema.set('collection', name);

  TheSchema.statics.getById = function(id) {
    return Q(this.findById(id).exec());
  };

  return TheSchema;
};
