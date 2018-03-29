'use strict';

var Q = require('q');
var _ = require('lodash');
var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var TwitterProfileSchema = require('./../schema/twitterProfile');
var FacebookProfileSchema = require('./../schema/facebookProfile');
var FitbitProfileSchema = require('./../schema/fitbitProfile');
var LinkedInProfileSchema = require('./../schema/linkedinProfile');
var DemographicsSchema = require('./demographic');

var schemas = require('./schemaName');

var ProfileSchema = builder(schemas.profile, {
  id: mongoose.Schema.ObjectId,
  source: String,
  email: { type: String, lowercase: true },
  displayName: String,
  password: String,
  username: String,
  applicationDescription: String,
  accessToken: String,
  pictureUrl: String,
  customTags: [String],
  activationDate: Date,
  followers: Number,
  followings: Number,
  language: String,
  location: String,
  latitude: Number,
  longitude: Number,
  connections: [String],
  identities: {
    twitter: TwitterProfileSchema,
    facebook: FacebookProfileSchema,
    fitbit: FitbitProfileSchema,
    linkedIn: LinkedInProfileSchema,
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
        deviceId: String,
        userAccountName: String,
        packageName: String
      }
    ],
    configs: {
      holisticProfileConfig: {
        shareDemographics: {type: Boolean, default: true},
        shareInterest: {type: Boolean, default: true},
        shareAffects: {type: Boolean, default: true},
        shareCognitiveAspects: {type: Boolean, default: true},
        shareBehavior: {type: Boolean, default: true},
        shareSocialRelations: {type: Boolean, default: true},
        sharePhysicalState: {type: Boolean, default: true}
      },
      facebookConfig: {
        facebookId: String,
        accessToken: String,
        expiresIn: Number,
        lastPostId: String,
        lastLikeId: String,
        shareProfile: Boolean,
        shareMessages: Boolean,
        shareFriends: Boolean,
        shareLikes: Boolean
      },
      fitbitConfig: {
        fitbitId: String,
        accessToken: String,
        expiresIn: Number,
        shareProfile: Boolean,
        shareActivity: Boolean,
        shareBodyWeight: Boolean,
        shareBody_Fat: Boolean,
        shareBody_Bmi: Boolean,
        shareDevices: Boolean,
        shareFood: Boolean,
        shareFriends: Boolean,
        shareHeartRate: Boolean,
        shareSleep: Boolean

      },
      twitterConfig: {
        twitterId: String,
        oauthToken: String,
        oauthTokenSecret: String,
        lastTweetId: String,
        shareProfile: Boolean,
        shareMessages: Boolean,
        shareFriends: Boolean
      },
      linkedInConfig: {
        linkedInId: String,
        accessToken: String,
        expiresIn: Number,
        shareProfile: Boolean
      },
      devicesConfig: [
        {
          deviceId: String,
          readGPS: String,
          readContact: String,
          readAccounts: String,
          readAppInfo: String,
          readNetStats: String,
          readDisplay: String,
          readActivity: String,
          shareGPS: String,
          shareContact: String,
          shareAccounts: String,
          shareAppInfo: String,
          shareNetStats: String,
          shareDisplay: String,
          shareActivity: String,
          timeReadGPS: String,
          timeReadContact: String,
          timeReadAccounts: String,
          timeReadAppInfo: String,
          timeReadNetStats: String,
          timeReadActivity: String
        }
      ]
    }
  },
  demographics: DemographicsSchema,
  interests: [schemas.interest]
});

ProfileSchema.statics.newFromObject = function(object) {
  return new this(object);
};

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
