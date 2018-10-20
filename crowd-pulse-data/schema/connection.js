'use strict';

var Q = require('q');
var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var ConnectionSchema = builder(schemas.connection, {
  id: mongoose.Schema.ObjectId,
  source: String,
  username: String,
  deviceId: String,
  share: Boolean,
  contactId: String,
  contactName: String,
  contactPhoneNumbers: [String],
  starred: Number,
  contactedTimes: Number,
  type: String
});


// Model methods

ConnectionSchema.statics.newFromObject = function(object) {
  return new this(object);
};

ConnectionSchema.statics.statContactBar = function (limitResults) {
  return Q(this.aggregate(buildStatContactBarQuery(limitResults)).exec());
};


var buildStatContactBarQuery = function (limitResults) {
  var aggregations = [];
  aggregations.push({
    $match: {
      contactedTimes: {$exists: true}
    }
  }, {
    $project: {
      _id: false,
      name: '$contactName',
      value: '$contactedTimes'
    }
  }, {
    $sort: {
      value: -1
    }
  });

  if (limitResults) {
    aggregations.push({
      $limit: parseInt(limitResults)
    });
  }

  return aggregations;
};

module.exports = ConnectionSchema;
