'use strict';

var Q = require('q');
var _ = require('lodash');
var qSend = require('../lib/expressQ').send;
var qErr = require('../lib/expressQ').error;
var router = require('express').Router();
var CrowdPulse = require('./../crowd-pulse-data');
var config = require('../lib/config');

module.exports = function() {

  var asArray = function(value) {
    var terms = [];
    if (!_.isUndefined(value)) {
      terms = _.isArray(value) ? value : [value];
    }
    return terms;
  };

  router.route('/stats/terms')
  // /api/stats/terms?db=sexism&from=2015-10-11&to=2015-10-13&type=tag&terms=aword&terms=anotherword
    .get(function(req, res) {
      var dbConn = new CrowdPulse();
      return dbConn.connect(config.database.url, req.query.db)
        .then(function(conn) {
          var stats = [];
          var queryTypes = ['tag', 'category', 'token'];
          // if the query type is not known, assume all
          if (_.isUndefined(req.query.type) || queryTypes.indexOf(req.query.type) < 0) {
            queryTypes.forEach(function(queryType) {
              stats.push(conn.Message.statTerms(queryType, [], req.query.from, req.query.to, req.query.sentiment, req.query.language, req.query.lat, req.query.lng, req.query.ray));
            });
          } else {
            var terms = asArray(req.query.terms);
            stats.push(conn.Message.statTerms(req.query.type, terms, req.query.from, req.query.to, req.query.sentiment, req.query.language, req.query.lat, req.query.lng, req.query.ray));
          }
          return Q.all(stats);
        })
        .then(function(results) {
          var result = [];
          results.forEach(function(r) {
            result = result.concat(r);
          });
          var all = _.sortByOrder(result, ['value'], ['desc']);
          return all.slice(0, 200);
        })
        .then(qSend(res))
        .catch(qErr(res))
        .finally(function() {
          dbConn.disconnect();
        });
    });

  var handleGenericStat = function(req, res, handler) {
    var dbConn = new CrowdPulse();
    return dbConn.connect(config.database.url, req.query.db)
      .then(function(conn) {
        var terms = asArray(req.query.terms);
        var users = asArray(req.query.users);
        return handler(conn, req.query.type, terms, req.query.from, req.query.to, req.query.sentiment, req.query.language, req.query.lat, req.query.lng, req.query.ray, req.query.topic, users);
      })
      .then(qSend(res))
      .catch(qErr(res))
      .finally(function() {
        dbConn.disconnect();
      });
  };


  router.route('/stats/sentiment')
  // /api/stats/sentiment?db=sexism&from=2015-10-11&to=2015-10-13&type=tag&terms=aword&terms=anotherword
    .get(function(req, res) {
      return handleGenericStat(req, res, function(conn, type, terms, from, to, sentiment, language, lat, lng, ray) {
        return conn.Message.statSentiment(type, terms, from, to, sentiment, language, lat, lng, ray);
      });
    });

  router.route('/stats/topic')
  // /api/stats/sentiment?db=sexism&from=2015-10-11&to=2015-10-13&type=tag&terms=aword&terms=anotherword
    .get(function(req, res) {
      return handleGenericStat(req, res, function(conn, type, terms, from, to, sentiment, language, lat, lng, ray) {
        return conn.Message.statTopic(type, terms, from, to, sentiment, language, lat, lng, ray);
      });
    });

  router.route('/stats/cluster')
  // /api/stats/sentiment?db=sexism&from=2015-10-11&to=2015-10-13&type=tag&terms=aword&terms=anotherword
    .get(function(req, res) {
      return handleGenericStat(req, res, function(conn, type, terms, from, to, sentiment, language, lat, lng, ray) {
        return conn.Message.statCluster(type, terms, from, to, sentiment, language, lat, lng, ray);
      });
    });

  router.route('/stats/map')
  // /api/stats/sentiment?db=sexism&from=2015-10-11&to=2015-10-13&type=tag&terms=aword&terms=anotherword
    .get(function(req, res) {
      return handleGenericStat(req, res, function(conn, type, terms, from, to, sentiment, language, lat, lng, ray) {
        return conn.Message.statMap(type, terms, from, to, sentiment, language, lat, lng, ray);
      });
    });

  router.route('/stats/topic/messages')
  // /api/stats/sentiment?db=sexism&from=2015-10-11&to=2015-10-13&type=tag&terms=aword&terms=anotherword
    .get(function(req, res) {
      return handleGenericStat(req, res, function(conn, type, terms, from, to, sentiment, language, lat, lng, ray, topic) {
        console.log(topic);
        return conn.Message.statTopicMessages(type, terms, from, to, sentiment, language, lat, lng, ray, topic);
      });
    });

  router.route('/stats/cluster/messages')
  // /api/stats/sentiment?db=sexism&from=2015-10-11&to=2015-10-13&type=tag&terms=aword&terms=anotherword
    .get(function(req, res) {
      return handleGenericStat(req, res, function(conn, type, terms, from, to, sentiment, language, lat, lng, ray, cluster) {
        return conn.Message.statClusterMessages(type, terms, from, to, sentiment, language, lat, lng, ray, cluster);
      });
    });

  router.route('/stats/sentiment/messages')
  // /api/stats/sentiment?db=sexism&from=2015-10-11&to=2015-10-13&type=tag&terms=aword&terms=anotherword
    .get(function(req, res) {
      return handleGenericStat(req, res, function(conn, type, terms, from, to, sentiment, language, lat, lng, ray, sen) {
        return conn.Message.statSentimentMessages(type, terms, from, to, sentiment, language, lat, lng, ray, sen);
      });
    });


  router.route('/stats/sentiment/timeline')
  // /api/stats/sentiment?db=sexism&from=2015-10-11&to=2015-10-13&type=tag&terms=aword&terms=anotherword
    .get(function(req, res) {
      return handleGenericStat(req, res, function(conn, type, terms, from, to, sentiment, language, lat, lng, ray) {
        return conn.Message.statSentimentTimeline(type, terms, from, to, sentiment, language, lat, lng, ray);
      });
    });

  router.route('/stats/message/timeline')
  // /api/stats/message/timeline?db=sexism&from=2015-10-11&to=2015-10-13&type=tag&terms=aword&terms=anotherword
    .get(function(req, res) {
      return handleGenericStat(req, res, function(conn, type, terms, from, to, sentiment, language, lat, lng, ray) {
        return conn.Message.statMessageTimeline(type, terms, from, to, sentiment, language, lat, lng, ray);
      });
    });

  router.route('/stats/profile/graph')
  // /api/stats/profile/graph?db=sexism&users=frapontillo&users=kotlin
    .get(function(req, res) {
      return handleGenericStat(req, res, function(conn, type, terms, from, to, sentiment, language, lat, lng, ray, topic, users) {
        console.log(users);
        return Q.all([conn.Profile.listGraphNodes(users), conn.Profile.listGraphEdges(users)])
          .spread(function(nodes, edges) {
            return {
              nodes: nodes,
              edges: edges
            };
          });
      })
    });

  router.route('/stats/personal_data/source')
    .get(function(req, res) {
      var dbConn = new CrowdPulse();
      return dbConn.connect(config.database.url, req.query.db).then(function(conn) {
        return conn.PersonalData.statPersonalDataSource();
      })
        .then(qSend(res))
        .catch(qErr(res))
        .finally(function() {
          dbConn.disconnect();
        });
    });

  router.route('/stats/personal_data/gps')
    .get(function(req, res) {
      var dbConn = new CrowdPulse();
      return dbConn.connect(config.database.url, req.query.db).then(function(conn) {
        return conn.PersonalData.statGPSMap(req.query.from, req.query.to, req.query.lat, req.query.lng, req.query.ray);
      })
        .then(qSend(res))
        .catch(qErr(res))
        .finally(function() {
          dbConn.disconnect();
        });
    });

  router.route('/stats/personal_data/appinfo/bar')
    .get(function(req, res) {
      var dbConn = new CrowdPulse();
      return dbConn.connect(config.database.url, req.query.db).then(function(conn) {
        return conn.PersonalData.statAppInfoBar(req.query.from, req.query.to, req.query.limitResults, req.query.groupByCategory);
      })
        .then(qSend(res))
        .catch(qErr(res))
        .finally(function() {
          dbConn.disconnect();
        });
    });

  router.route('/stats/personal_data/appinfo/timeline')
    .get(function(req, res) {
      var dbConn = new CrowdPulse();
      return dbConn.connect(config.database.url, req.query.db).then(function(conn) {
        return conn.PersonalData.statAppInfoTimeline(req.query.from, req.query.to);
      })
        .then(qSend(res))
        .catch(qErr(res))
        .finally(function() {
          dbConn.disconnect();
        });
    });

  router.route('/stats/personal_data/netstat/timeline')
    .get(function(req, res) {
      var dbConn = new CrowdPulse();
      return dbConn.connect(config.database.url, req.query.db).then(function(conn) {
        return conn.PersonalData.statNetStatTimeline(req.query.from, req.query.to);
      })
        .then(qSend(res))
        .catch(qErr(res))
        .finally(function() {
          dbConn.disconnect();
        });
    });

  router.route('/stats/personal_data/netstat/bar')
    .get(function(req, res) {
      var dbConn = new CrowdPulse();
      return dbConn.connect(config.database.url, req.query.db).then(function(conn) {
        return conn.PersonalData.statNetStatBar(req.query.from, req.query.to);
      })
        .then(qSend(res))
        .catch(qErr(res))
        .finally(function() {
          dbConn.disconnect();
        });
    });

  router.route('/stats/personal_data/contact/bar')
    .get(function(req, res) {
      var dbConn = new CrowdPulse();
      return dbConn.connect(config.database.url, req.query.db).then(function(conn) {
        return conn.Connection.statContactBar(req.query.limitResults);
      })
        .then(qSend(res))
        .catch(qErr(res))
        .finally(function() {
          dbConn.disconnect();
        });
    });

  router.route('/stats/personal_data/display/bar')
    .get(function(req, res) {
      var dbConn = new CrowdPulse();
      return dbConn.connect(config.database.url, req.query.db).then(function(conn) {
        return conn.PersonalData.statDisplayBar(req.query.from, req.query.to);
      })
        .then(qSend(res))
        .catch(qErr(res))
        .finally(function() {
          dbConn.disconnect();
        });
    });

  router.route('/stats/interests/wordcloud')
    .get(function(req, res) {
      var dbConn = new CrowdPulse();
      return dbConn.connect(config.database.url, req.query.db).then(function(conn) {
        return conn.Interest.statWordCloud(req.query.from, req.query.to, req.query.source);
      })
        .then(qSend(res))
        .catch(qErr(res))
        .finally(function() {
          dbConn.disconnect();
        });
    });

  return router;
};
