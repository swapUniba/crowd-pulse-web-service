'use strict';

var Q = require('q');
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

// Model methods

InterestSchema.statics.newFromObject = function(object) {
  return new this(object);
};

InterestSchema.statics.statWordCloud = function (from, to, source) {
  return Q(this.aggregate(buildStatWordCloud(from, to, source)).exec());
};


var buildStatWordCloud = function(from, to, source) {
  var filter = undefined;

  from = new Date(from);
  to = new Date(to);
  var hasFrom = !isNaN(from.getDate());
  var hasTo = !isNaN(to.getDate());
  var hasSource = (typeof source != 'undefined' && source!='');

  if (hasFrom || hasTo || hasSource) {
    filter = {$match: {}};

    if (hasFrom || hasTo) {
      filter.$match['timestamp'] = {};
      if (hasFrom) {
        filter.$match['timestamp']['$gte'] = from.getTime();
      }
      if (hasTo) {
        filter.$match['timestamp']['$lte'] = to.getTime();
      }
    }

    if (hasSource) {
      filter.$match['source'] = source;
    }
  }

  var aggregations = [];

  if (filter) {
    aggregations.push(filter);
  }

  aggregations.push({
    $project: {
      value: "$value"
    }
  },{
    $group: {
      _id: "$value",
      weight: {$sum: 1}
    }
  }, {
    $project: {
      _id: false,
      value: "$_id",
      weight: true
    }
  }, {
    $sort: {
      weight: -1
    }
  }, {
    $limit: 100
  });

  return aggregations;
};

module.exports = InterestSchema;
