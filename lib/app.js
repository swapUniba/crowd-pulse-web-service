var path = require('path');

var http = require('http');
var socket = require('socket.io');
var express = require('express');
var schedule = require('node-schedule');

var session = require('express-session');
var cookieParser = require('cookie-parser');
var cors = require('cors');
var logger = require('morgan');
var bodyParser = require('body-parser');

var CrowdPulse = require('./../crowd-pulse-data');

var bootstrapMeMaybe = require('./../bootstrap/bootstrap');
var oAuthSetup = require('./../oauth2/setup');      // TODO delete this
var validationRequest = require('./validateRequest');

var endpointProjects = require('./../endpoint/projects');
var endpointDatabases = require('./../endpoint/databases');
var endpointTerms = require('./../endpoint/terms');
var endpointStats = require('./../endpoint/stats');
var endpointProfiles = require('./../endpoint/profiles');
var endpointLanguages = require('./../endpoint/languages');
var endpointTwitter = require('./../endpoint/twitter');
var endpointFacebook = require('./../endpoint/facebook');
var endpointLinkedin = require('./../endpoint/linkedin');
var endpointAuth = require('./../endpoint/auth');
var socketLogs = require('./../sockets/logs');
var socketMobileApp = require('./../sockets/mobileapp');

var config = require('./config');

// the main server
var server = undefined;

// the express application
var app = {};

// the websocket server
var io = undefined;

var crowdPulse = new CrowdPulse();

var connect = function() {
  return crowdPulse.connect(config.database.url, config.database.db);
};

var webServiceSetup = function(crowdPulse) {

  // create the application and bind it to a server
  app = express();
  server = http.createServer(app);

  // setup middlewares
  app.use(cookieParser());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended: true}));
  app.use(logger('dev'));
  // app.use(session(config.session));
  app.use(cors());

  // TODO: add more endpoints here
  var API = '/api';
  var AUTH = '/auth';

  // used to restrict API access
  app.all(API + '/*', [validationRequest]);

  app.use(API, endpointProjects(crowdPulse));
  app.use(API, endpointDatabases(crowdPulse));
  app.use(API, endpointTerms(crowdPulse));
  app.use(API, endpointStats(crowdPulse));
  app.use(API, endpointProfiles(crowdPulse));
  app.use(API, endpointLanguages(crowdPulse));
  app.use(API, endpointTwitter(crowdPulse));
  app.use(API, endpointFacebook(crowdPulse));
  app.use(API, endpointLinkedin(crowdPulse));
  app.use(AUTH, endpointAuth(crowdPulse));

  return crowdPulse;
};

var webSocketSetup = function() {
  io = socket(server);
  socketLogs(io, crowdPulse);
  socketMobileApp(io);
};

// updating data jobs (eg. Twitter user data, stats, etc.)
var scheduleJobSetup = function () {

  // test schedule job (every 10 seconds) TODO change here
  // TODO read time from config file
  schedule.scheduleJob('*/10 * * * * *', function(){
    // console.log('The answer to life, the universe, and everything!');
  });
};

module.exports = function() {
  return connect()
    .then(function() {
      return bootstrapMeMaybe(crowdPulse, config);
    })
    .then(function() {
      return webServiceSetup(crowdPulse);
    })
    .then(function() {
      return webSocketSetup(crowdPulse);
    })
    .then(function () {
      return scheduleJobSetup();
    })
      /*
    .then(function() {
      return oAuthSetup(crowdPulse, app);
    })
    */
    .then(function() {
      app.set('views', path.join(__dirname, 'views'));
      app.set('view engine', 'ejs');
      app.use(express.static(path.join(__dirname, 'public')));

      /*
      app.get('/', app.oAuth.authorise(), function(req, res) {
        res.send('Secret area');
      });
      */

      app.set('port', config.port || process.env.PORT || 5000);

      server.listen(app.get('port'), function() {
        console.log('Crowd Pulse Web Service listening at %s:%s...',
          server.address().address, server.address().port);
        console.log('Press CTRL+C to quit.');
      });

      return {
        app: app,
        io: io,
        server: server,
        crowdPulse: crowdPulse
      };
    })
    .catch(function(err) {
      console.error(err.stack);
    });
};