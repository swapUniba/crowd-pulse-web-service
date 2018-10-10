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
  date: Date,
  share: Boolean
});

LikeSchema.statics.newFromObject = function(object) {
  return new this(object);
};

LikeSchema.statics.findLikes = function(from, to, limitResults) {

  from = new Date(from);
  to = new Date(to);
  var filter = undefined;
  var hasFrom = !isNaN(from.getDate());
  var hasTo = !isNaN(to.getDate());

  if (hasFrom || hasTo) {
    filter = {$match: {}};

    if (hasFrom || hasTo) {
      filter.$match['date'] = {};
      if (hasFrom) {
        filter.$match['date']['$gte'] = from;
      }
      if (hasTo) {
        filter.$match['date']['$lte'] = to;
      }
    }
  }
  var aggregations = [];

  if (filter) {
    aggregations.push(filter);
  }

  aggregations.push({
    $sort: {date: -1}
  });

  if (limitResults) {
    aggregations.push({
      $limit: parseInt(limitResults)
    });
  }
  return Q(this.aggregate(aggregations).exec());
};

module.exports = LikeSchema;
