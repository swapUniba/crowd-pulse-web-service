'use strict';

var Q = require('q');
var _ = require('lodash');
var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var TwitterProfileSchema = require('./../schema/twitterProfile');
var FacebookProfileSchema = require('./../schema/facebookProfile');
var FitbitProfileSchema = require('./../schema/fitbitProfile');
var LinkedInProfileSchema = require('./../schema/linkedinProfile');
var InstagramProfileSchema = require('./../schema/instagramProfile');
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
    instagram: InstagramProfileSchema,
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
        refreshToken: String,
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
      instagramConfig: {
        instagramId: String,
        accessToken: String,
        lastPostId: String,
        shareProfile: Boolean,
        shareMessages: Boolean
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
  personalities: [{
    openness: Number,
    conscientiousness: Number,
    extroversion: Number,
    agreeableness: Number,
    neuroticism: Number,
    timestamp: Number,
    source: String,
    confidence: Number
  }],
  empathies: [{
    value: Number,
    timestamp: Number,
    source: String,
    confidence: Number
  }]
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

ProfileSchema.statics.demographicsLocation = function () {
  var aggregations = [
    {
      $match: {
        'identities.configs.holisticProfileConfig': {$exists: true},
        'identities.configs.holisticProfileConfig.shareDemographics': true,
        'demographics.location': {$exists: true}
      }
    }
  ];
  return Q(this.aggregate(aggregations).exec()).then(function (profiles) {
    var results = {};
    if (profiles) {
      profiles.forEach(function (profile) {
        if (profile.demographics.location.length > 0) {
          var location = profile.demographics.location.sort(function (a, b) {
            return  b.timestamp - a.timestamp;
          })[0].value;
          if (location) {
            results[location] = results[location] ? ++results[location] : 1;
          }
        }
      });
    }
    return Q(results);
  });
};

ProfileSchema.statics.demographicsGender = function () {
  var aggregations = [
    {
      $match: {
        'identities.configs.holisticProfileConfig': {$exists: true},
        'identities.configs.holisticProfileConfig.shareDemographics': true,
        'demographics.gender': {$exists: true}
      }
    }
  ];
  return Q(this.aggregate(aggregations).exec()).then(function (profiles) {
    var results = {};
    if (profiles) {
      profiles.forEach(function (profile) {
        if (profile.demographics.gender) {
          var gender = profile.demographics.gender.value;
          results[gender] = results[gender] ? ++results[gender] : 1;
        }
      });
    }
    return Q(results);
  });
};

ProfileSchema.statics.demographicsLanguage = function () {
  var aggregations = [
    {
      $match: {
        'identities.configs.holisticProfileConfig': {$exists: true},
        'identities.configs.holisticProfileConfig.shareDemographics': true,
        'demographics.language': {$exists: true}
      }
    }
  ];
  return Q(this.aggregate(aggregations).exec()).then(function (profiles) {
    var results = {};
    if (profiles) {
      profiles.forEach(function (profile) {
        if (profile.demographics.language.length > 0) {
          var sortedLanguages = profile.demographics.language.sort(function (a, b) {
            return  b.timestamp - a.timestamp;
          });

          for (var i = 0; i < sortedLanguages.length; i++) {
            results[sortedLanguages[i].value] = results[sortedLanguages[i].value] ? ++results[sortedLanguages[i].value] : 1;

            if (sortedLanguages[i].timestamp !== sortedLanguages[0].timestamp) {
              break;
            }
          }
        }
      });
    }
    return Q(results);
  });
};

module.exports = ProfileSchema;
