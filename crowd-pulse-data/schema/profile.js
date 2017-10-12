'use strict';

var Q = require('q');
var _ = require('lodash');
var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var ProfileSchema = builder(schemas.profile, {
  id: mongoose.Schema.ObjectId,
  source: String,
  email: { type: String, lowercase: true },
  displayName: String,
  password: String,
  username: String,
  customTags: [String],
  activationDate: Date,
  followers: Number,
  followings: Number,
  language: String,
  location: String,
  latitude: Number,
  longitude: Number,
  connections: [String],
  devices: [
      {
        deviceId: String,
        brand: String,
        model: String,
        sdk: Number,
        phoneNumbers: [String]
      }
  ],
  accounts: [
      {
        userAccountName: String,
        packageName: String
      }
  ],
  deviceConfigs: [
      {
        deviceId: String,
        readGPS: Number,
        readContact: Number,
        readAccounts: Number,
        readAppInfo: Number,
        readNetStats: Number,
        readDisplay: Number,
        timeReadGPS: Number,
        timeReadContact: Number,
        timeReadAccounts: Number,
        timeReadAppInfo: Number,
        timeReadNetStats: Number
      }
  ]
});

ProfileSchema.statics.listGraphNodes = function(users) {
  var inNodesQuery = [
    {
      $match: {
        username: {$in: users}
      }
    }, {
      $project: {
        _id: false,
        'id': '$connections'
      }
    }, {
      $unwind: '$id'
    }, {
      $group: {
        _id: '$id'
      }
    }, {
      $match: {
        _id: {
          $not: {
            $in: users
          }
        }
      }
    }, {
      $project: {
        _id: false,
        id: '$_id'
      }
    }, {
      $sort: {
        id: 1
      }
    }
  ];
  var outNodesQuery = [
    {
      $match: {
        username: {$in: users}
      }
    }, {
      $group: {
        _id: '$username'
      }
    }, {
      $project: {
        _id: false,
        'id': '$_id'
      }
    }, {
      $sort: {
        id: 1
      }
    }
  ];
  return Q.all([this.aggregate(inNodesQuery).exec(), this.aggregate(outNodesQuery).exec()])
    .spread(function(inNodes, outNodes) {
      return [].concat(inNodes).concat(outNodes);
    });
};

ProfileSchema.statics.listGraphEdges = function(users) {
  var query = [
    {
      $match: {
        username: {$in: users},
        $or: [{connections: {$ne: null}}, {connections: {$gt: 0}}]
      }
    }, {
      $project: {
        _id: false,
        source: '$username',
        target: '$connections'
      }
    }, {
      $unwind: '$target'
    }
  ];
  return Q(this.aggregate(query).exec());
};

ProfileSchema.statics.search = function(username) {
  var model = this;
  var regex = new RegExp('^' + (username || ''), 'i');
  var aggregations = [
    {
      $match: {
        username: {$regex: regex, $options: 'i'}
      }
    }, {
      $group: {
        _id: '$username'
      }
    }, {
      $project: {
        _id: false,
        username: '$_id'
      }
    }, {
      $sort: {
        username: 1
      }
    }
  ];
  return Q(model.aggregate(aggregations).exec());
};

module.exports = ProfileSchema;
