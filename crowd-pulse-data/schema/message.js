'use strict';

var Q = require('q');
var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');
var databaseName = require('./../databaseName');

var MessageSchema = builder(schemas.message, {
  id: mongoose.Schema.ObjectId,
  oId: String,
  text: String,
  story: String,
  source: String,
  fromUser: String,
  toUsers: [String],
  refUsers: [String],
  date: Date,
  parent: String,
  customTags: [String],
  language: String,
  latitude: Number,
  longitude: Number,
  favs: Number,
  shares: Number,
  share: Boolean,
  tags: [schemas.tag],
  tokens: [schemas.token],
  sentiment: Number,
  number_cluster: Number,
  cluster_kmeans: Number,
  emotion: String,
  images: [String],
  likes: Number,
  comments: Number,
  location: String
});

MessageSchema.statics.newFromObject = function(object) {
  return new this(object);
};

var buildSearchQuery = function(type, search) {
  var queryOn;
  var unwinds = 1;
  if (type === 'tag') {
    queryOn = 'tags._id';
  } else if (type === 'token') {
    queryOn = 'tokens.text';
  } else if (type === 'category') {
    // categories are two levels nested
    queryOn = 'tags.categories.text';
    unwinds = 2;
  } else {
    throw new Error('"' + type + '" is an unknown search type.');
  }
  var regex = new RegExp(search, 'i');
  // match all messages with at least one element matching
  var matchFirstStep = {
    '$match': {}
  };
  matchFirstStep['$match'][queryOn] = {$regex: regex, $options: 'i'};
  // project only elements of interest
  var projectSecondStep = {
    $project: {_id: false, 'item': '$' + queryOn}
  };
  // unwind all elements from arrays to single values (n levels of nesting = n unwinds)
  var unwindStep = {$unwind: '$item'};
  var steps = [
    matchFirstStep,
    projectSecondStep
  ];
  for (var i = 0; i < unwinds; i++) {
    steps.push(unwindStep);
  }
  // remove duplicate values, re-search on the search parameter, finally sort elements
  steps.push(
    {$group: {_id: "$item"}},
    {$match: {_id: {$regex: regex, $options: 'i'}}},
    {$sort: {_id: 1}}
  );
  return steps;
};

MessageSchema.statics.searchTerm = function(type, term) {
  var model = this;
  return Q(model.aggregate(buildSearchQuery(type, term)).exec());
};

var buildFilter = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  var filter = undefined;

  var hasTags = (type === 'tag');
  var hasTokens = (type === 'token');
  var hasCategories = (type === 'category');

  from = new Date(from);
  to = new Date(to);
  var hasFrom = !isNaN(from.getDate());
  var hasTo = !isNaN(to.getDate());
  
  var hasTerms = (terms && terms.length > 0);
  var hasSentiment = (typeof sentiment != 'undefined' && sentiment!='');
  var hasLanguage = (typeof language != 'undefined' && language!='');
    
  var hasLat = (typeof lat != 'undefined' && lat!='');
  var hasLng = (typeof lng != 'undefined' && lng!='');
  var hasRay = (typeof ray != 'undefined' && ray!='');

    
  // if there is at least one filter, create the filter object
  if (hasTerms || hasFrom || hasTo || hasSentiment || hasLanguage || (hasLat && hasLng && hasRay)) {
    filter = {$match: {}};
    if (hasTags && hasTerms) {
      filter.$match['tags._id'] = {$all: terms};
    } else if (hasTokens && hasTerms) {
      filter.$match['tokens.text'] = {$all: terms};
    } else if (hasCategories && hasTerms) {
      filter.$match['tags.categories.text'] = {$all: terms};
    }
    if (hasFrom || hasTo) {
      filter.$match['date'] = {};
      if (hasFrom) {
        filter.$match['date']['$gte'] = from;
      }
      if (hasTo) {
        filter.$match['date']['$lte'] = to;
      }
    }
    if(hasSentiment){
        if(sentiment == 'positive'){
            filter.$match['sentiment'] = 1;
        }else{
            if(sentiment=='negative'){
                filter.$match['sentiment'] = -1;
            }else{
                filter.$match['sentiment'] = 0;
            }
        }
    }
    if(hasLanguage){
        filter.$match['language'] = language; 
    }
    
    if(hasLat && hasLng && hasRay){
        lng = Number(lng);
        lat = Number(lat);
        ray = Number(ray);
        filter.$match['longitude'] = {$gt: lng - ray, $lt: lng + ray }; 
        filter.$match['latitude'] = {$gt: lat - ray , $lt: lat + ray }; 

    }
  }
    
  return filter;
};

var buildStatTermsQuery = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  var tagsSel = {$literal: []};
  var tokensSel = {$literal: []};
  var categoriesSel = {$literal: [[]]};
  var hasTags = (type === 'tag');
  var hasTokens = (type === 'token');
  var hasCategories = (type === 'category');

  // create the filter
  var filter = buildFilter(type, terms, from, to, sentiment, language, lat, lng, ray);

  var unionSet = [];
  if (hasTags || hasCategories) {
    tagsSel = {$ifNull: ['$tags', []]};
    if (hasTags) {
      unionSet.push('$tags');
    }
    if (hasCategories) {
      unionSet.push('$categories');
      categoriesSel = {
        $cond: {
          if: {$or: [{$eq: ['$tags.categories', undefined]}, {$eq: ['$tags.categories', []]}]},
          then: [[]],
          else: '$tags.categories'
        }
      };
    }
  }

  if (hasTokens) {
    unionSet.push('$tokens');
    tokensSel = {$ifNull: ['$tokens', []]};
  }

  var aggregations = [{
    $match: {
      $or: [
        {'tags._id': {$ne: null}},
        {'tokens.text': {$ne: null}},
        {'tags.categories.text': {$ne: null}}
      ]
    }
  }];

  if (filter) {
    aggregations.push(filter);
  }

  aggregations.push({
    $project: {
      _id: false,
      'tags': tagsSel,
      'tokens': tokensSel
    }
  }, {
    $project: {
      'tags._id': true,
      'tags.stopWord': true,
      'tokens.text': true,
      'tokens.stopWord': true,
      'categories': categoriesSel
    }
  }, {
    $unwind: '$categories'
  }, {
    $project: {
      'words': {$setUnion: unionSet}
    }
  }, {
    $unwind: '$words'
  }, {
    $match: {
      'words.stopWord': false
    }
  }, {
    $project: {
      'text': {$ifNull: ['$words.text', '$words._id']}
    }
  }, {
    $group: {_id: '$text', value: {$sum: 1}}
  }, {
    $project: {_id: false, name: '$_id', value: true}
  }, {
    $sort: {value: -1}
  }, {
    $limit: 200
  });

  return aggregations;
};

var sentimentProjection = {
  $cond: {
    if: {$eq: ['$_id', 0]},
    then: 'neuter',
    else: {
      $cond: {
        if: {$eq: ['$_id', 1]},
        then: 'positive',
        else: {
            $cond: {
                if: {$eq: ['$_id', -1]},
                then: 'negative',
                else: 'No sentiment'
            }
        }
      }
    }
  }
};

var topicProjection = {
  $cond: {
    if: {$eq: ['$_id', '$_id']},
    then: '$_id'
  }
};





var buildStatSentimentQuery = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  // create the filter
  var filter = buildFilter(type, terms, from, to, sentiment, language, lat, lng, ray);

  var aggregations = [];

  if (filter) {
    aggregations.push(filter);
  }

  aggregations.push({
    $group: {
      _id: '$sentiment',
      value: {
        $sum: 1
      }
    }
  }, {
    $project: {
      _id: false,
      name: sentimentProjection,
      value: true
    }
  });

  return aggregations;
};

var buildStatTopicQuery = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  // create the filter
  var filter = buildFilter(type, terms, from, to, sentiment, language, lat, lng, ray);

  var aggregations = [];

  if (filter) {
    aggregations.push(filter);
  }

  aggregations.push({
    $group: {
      _id: '$number_cluster',
      value: {
        $sum: 1
      }
    }
  }, {
    $project: {
      _id: false,
      name:  '$_id',
      value: true
    }
  });

  return aggregations;
};

var buildStatClusterQuery = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  // create the filter
  var filter = buildFilter(type, terms, from, to, sentiment, language, lat, lng, ray);

  var aggregations = [];

  if (filter) {
    aggregations.push(filter);
  }

  aggregations.push({
    $group: {
      _id: '$cluster_kmeans',
      value: {
        $sum: 1
      }
    }
  }, {
    $project: {
      _id: false,
      name:  '$_id',
      value: true
    }
  });

  return aggregations;
};



var buildStatMapQuery = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  // create the filter
  var filter = buildFilter(type, terms, from, to, sentiment, language, lat, lng, ray);

  var aggregations = [];

  if (filter) {
    aggregations.push(filter);
  }

  if (type === databaseName.globalData) {
    aggregations.push({
      $match: {
        share: true
      }
    });
  }

  aggregations.push({
    $match: {
      latitude: {$exists: true}
    }
  }, {
    $project: {
      _id: false,
      latitude:  true,
      longitude: true,
      text: true,
      images: true,
      date: true,
      fromUser: true
    }
  });
 // console.log(aggregations);
  return aggregations;
};


var buildStatTopicMessagesQuery = function(type, terms, from, to, sentiment, language, lat, lng, ray, topic) {
  // create the filter
  var filter = buildFilter(type, terms, from, to, sentiment, language, lat, lng, ray);
  
  var query = [];

  if (filter) {
    query.push(filter);
  }

  query.push({'number_cluster': topic});
  return {'number_cluster': topic};
};

var buildStatClusterMessagesQuery = function(type, terms, from, to, sentiment, language, lat, lng, ray, topic) {
  // create the filter
  var filter = buildFilter(type, terms, from, to, sentiment, language, lat, lng, ray);
  
  var query = [];

  if (filter) {
    query.push(filter);
  }

  query.push({'cluster_kmeans': topic});
  return {'cluster_kmeans': topic};
};


var buildStatSentimentMessagesQuery = function(type, terms, from, to, sentiment, language, lat, lng, ray, sen) {
  // create the filter
  var filter = buildFilter(type, terms, from, to, sentiment, language, lat, lng, ray);
  
  var query = [];
  var sent;
  if (filter) {
    query.push(filter);
  }

  if(sen=="neuter")
      sent=0;
  else
      if(sen=="positive")
          sent=1;
      else
          if(sen == "negative")
            sent=-1;
          else
              return  {'sentiment': {'$exists': false}};
    
  query.push({'sentiment': sent});
  return {'sentiment': sent};
};

var buildStatSentimentTimelineQuery = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  // create the filter
  var filter = buildFilter(type, terms, from, to, sentiment, language, lat, lng, ray);

  var aggregations = [];

  if (filter) {
    aggregations.push(filter);
  }

  // getting global data, filter message share value
  if (type === databaseName.globalData) {
    aggregations.push({
      $match: {
        share: {$eq: true}
      }
    })
  }

  aggregations.push({
    $project: {
      _id: false,
      date: {$dateToString: {format: "%Y-%m-%dT00:00:00Z", date: "$date"}},
      sentiment: true
    }
  }, {
    $group: {
      _id: {sentiment: '$sentiment', date: '$date'},
      value: {
        $sum: 1
      }
    }
  }, {
    $project: {
      _id: false,
      sentiment: '$_id.sentiment',
      date: '$_id.date',
      value: '$value'
    }
  }, {
    $sort: {'date': 1}
  }, {
    $group: {
      _id: '$sentiment',
      values: {
        $push: {
          date: '$date',
          value: '$value'
        }
      }
    }
  }, {
    $project: {
      _id: false,
      name: sentimentProjection,
      values: true
    }
  });

  return aggregations;
};

var buildStatEmotionTimelineQuery = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  // create the filter
  var filter = buildFilter(type, terms, from, to, sentiment, language, lat, lng, ray);

  var aggregations = [];

  if (filter) {
    aggregations.push(filter);
  }

  // getting global data, filter message share value
  if (type === databaseName.globalData) {
    aggregations.push({
      $match: {
        share: {$eq: true}
      }
    })
  }

  aggregations.push({
    $match: {
      emotion: {$exists: true, $ne: null, $ne: undefined, $ne: "none"}
    }
  }, {
    $project: {
      _id: false,
      date: {$dateToString: {format: "%Y-%m-%dT00:00:00Z", date: "$date"}},
      emotion: true
    }
  }, {
    $group: {
      _id: {emotion: '$emotion', date: '$date'},
      value: {
        $sum: 1
      }
    }
  }, {
    $project: {
      _id: false,
      emotion: '$_id.emotion',
      date: '$_id.date',
      value: '$value'
    }
  }, {
    $sort: {'date': 1}
  }, {
    $group: {
      _id: '$emotion',
      values: {
        $push: {
          date: '$date',
          value: '$value'
        }
      }
    }
  }, {
    $project: {
      _id: false,
      name: '$_id',
      values: true
    }
  });

  return aggregations;
};

var buildStatMessageTimelineQuery = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  // create the filter
  var filter = buildFilter(type, terms, from, to, sentiment, language, lat, lng, ray);

  var aggregations = [];

  if (filter) {
    aggregations.push(filter);
  }

  aggregations.push({
    $project: {
      _id: false,
      date: {$dateToString: {format: "%Y-%m-%dT00:00:00Z", date: "$date"}}
    }
  }, {
    $group: {
      _id: '$date',
      value: {
        $sum: 1
      }
    }
  }, {
    $sort: {_id: 1}
  }, {
    $group: {
      _id: false,
      values: {
        $push: {
          date: '$_id',
          value: '$value'
        }
      }
    }
  }, {
    $project: {
      name: {$literal: 'Messages'},
      _id: false,
      values: true
    }
  });

  return aggregations;
};

MessageSchema.statics.statTerms = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  return Q(this.aggregate(buildStatTermsQuery(type, terms, from, to, sentiment, language, lat, lng, ray)).exec());
};

MessageSchema.statics.statSentiment = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  return Q(this.aggregate(buildStatSentimentQuery(type, terms, from, to, sentiment, language, lat, lng, ray)).exec());
};

MessageSchema.statics.statTopic = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  return Q(this.aggregate(buildStatTopicQuery(type, terms, from, to, sentiment, language, lat, lng, ray)).exec());
};

MessageSchema.statics.statCluster = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  return Q(this.aggregate(buildStatClusterQuery(type, terms, from, to, sentiment, language, lat, lng, ray)).exec());
};

MessageSchema.statics.statMap = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  return Q(this.aggregate(buildStatMapQuery(type, terms, from, to, sentiment, language, lat, lng, ray)).exec());
};

MessageSchema.statics.statTopicMessages = function(type, terms, from, to, sentiment, language, lat, lng, ray, topic) {
  return Q(this.find(buildStatTopicMessagesQuery(type, terms, from, to, sentiment, language, lat, lng, ray, topic)).exec());
};

MessageSchema.statics.statClusterMessages = function(type, terms, from, to,sentiment, language, lat, lng, ray, topic) {
  return Q(this.find(buildStatClusterMessagesQuery(type, terms, from, to, sentiment, language, lat, lng, ray, topic)).exec());
};

MessageSchema.statics.statSentimentMessages = function(type, terms, from, to,sentiment, language, lat, lng, ray, sen) {
  return Q(this.find(buildStatSentimentMessagesQuery(type, terms, from, to, sentiment, language, lat, lng, ray, sen)).exec());
};

MessageSchema.statics.statEmotionTimeline = function(type, terms, from, to,sentiment, language, lat, lng, ray, sen) {
  return Q(this.aggregate(buildStatEmotionTimelineQuery(type, terms, from, to, sentiment, language, lat, lng, ray, sen)).exec());
};

MessageSchema.statics.statSentimentTimeline = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  return Q(this.aggregate(buildStatSentimentTimelineQuery(type, terms, from, to, sentiment, language, lat, lng, ray)).exec());
};

MessageSchema.statics.statMessageTimeline = function(type, terms, from, to, sentiment, language, lat, lng, ray) {
  return Q(this.aggregate(buildStatMessageTimelineQuery(type, terms, from, to, sentiment, language, lat, lng, ray)).exec());
};

MessageSchema.statics.getLanguages = function() {
  return Q(this.aggregate([
    {
      $match: {
        language: {
          $ne: null
        }
      }
    },
    {
      $group: {
        _id: '$language'
      }
    }, {
      $project: {
        _id: false,
        language: '$_id'
      }
    }, {
      $sort: {
        language: 1
      }
    }
  ]).exec());
};

MessageSchema.statics.search = function(author, language, sentiment) {
  var params = {};
  if (author) {
    params.fromUser = author;
  }
  if (language) {
    params.language = language;
  }
  if (sentiment === 'positive') {
    params.sentiment = {
      $gt: 0
    };
  } else if (sentiment === 'negative') {
    params.sentiment = {
      $lt: 0
    };
  } else if (sentiment === 'neuter') {
    params.sentiment = 0;
  }
  return Q(this.find(params).exec());
};

module.exports = MessageSchema;
