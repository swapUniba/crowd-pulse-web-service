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

InterestSchema.statics.statWordCloud = function (from, to, source, limitResults) {
  return Q(this.aggregate(buildStatWordCloud(from, to, source, limitResults)).exec()).then(function (data) {

    // choose 'today' as default value
    to = to ? new Date(to): new Date();

    if (data && data.length > 0) {
      data.forEach(function (interest) {

        // calculate weight as a function of time
        interest.weight = (1 - (to.getTime() - interest.timestamp) / to.getTime()) * interest.weight;
      });
    }

    return Q(data);
  });
};


var buildStatWordCloud = function(from, to, source, limitResults) {
  var filter = undefined;

  from = new Date(from);
  to = new Date(to);
  var hasFrom = !isNaN(from.getDate());
  var hasTo = !isNaN(to.getDate());
  var hasSource = (typeof source !== 'undefined' && source !== '');

  // group by query
  var groupBy = {
    _id: "$value",
    timestamp: { $max: "$timestamp" },
    weight: { $sum: "$confidence" }
  };

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
  }

  if (hasSource) {
    filter.$match['source'] = source;

    // sum confidence only for the app (confidence is the foreground time)
    if (source === 'app_category') {
      groupBy['weight'] = {$sum: '$confidence'};
    }

  } else {

    if (filter === undefined) {
      filter = {$match: {}};
    }

    // exclude app category from "ALL" interests visualization (for confidence problem in visualization)
    filter.$match['source'] = {$ne: 'app_category'};
  }

  var aggregations = [];

  if (filter) {
    aggregations.push(filter);
  }

  aggregations.push({
    $project: {
      _id: false,
      value: '$value',
      confidence: '$confidence',
      timestamp: '$timestamp'
    }
  }, {
    $group: groupBy
  }, {
    $project: {
      _id: false,
      value: '$_id',
      weight: true,
      timestamp: true
    }
  }, {
    $sort: {
      weight: -1
    }
  }, {
    $limit: 200
  });

  if (limitResults) {
    aggregations.push({
      $limit: parseInt(limitResults)
    });
  }

  return aggregations;
};

module.exports = InterestSchema;
