'use strict';

var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var InterestSchema = builder(schemas.interest, {
  id: mongoose.Schema.ObjectId,
  value: String,
  source: String,
  timestamp: Number,
  confidence: Number
});

InterestSchema.statics.newFromObject = function(object) {
  return new this(object);
};

module.exports = InterestSchema;

/*
 db.getCollection('Interest').aggregate([{
    $project: {
      word: "$oId"
    }
  }, {
    $group: {
      _id: "$word",
      total: {$sum: 1}
    }
  },{
    $project: {
      _id: false,
      word: "$_id",
      total: true
    }
  }]);
*/