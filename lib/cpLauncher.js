'use strict';

var Q = require('q');
var fs = require('fs');
var qFs = require('q-io/fs');
var spawn = require('child_process').spawn;
var mkdirp = require('mkdirp');
var config = require('../lib/config');

/**
 * Execute Crowd Pulse Core using the provided parameters.
 *
 * @param {String} exec - The Crowd Pulse Core executable path.
 * @param {String=} projectRunId - The project run ID to update in the database.
 * @param {String=} log - The exec to redirect the standard output to.
 * @param {String=} databaseConnection - The connection string for the Mongo DB where the project
 * run information is contained.
 * @param {String} configuration - A configuration JSON for the run.
 */
var execute = function(exec, projectRunId, log, databaseConnection, configuration) {
  var input = 'pipe';
  var output = 'pipe';
  var error = 'pipe';

  // prepare the crowd pulse arguments
  var args = [];
  if (projectRunId) {
    args.push('--run', projectRunId);
  }
  if (log) {
    args.push('--log', log);
    // write output and error to the same file
    var logFile = fs.openSync(log, 'w');
    output = logFile;
    error = logFile;
  }
  if (databaseConnection) {
    args.push('--db', databaseConnection);
  }

  console.log('Crowd Pulse launching:', exec, args.join(' '));

  // spawn the process as detached so it doesn't depend on the NodeJS application
  var child = spawn(exec, args, {
    detached: true,
    stdio: [input, output, error]
  });

  // write the configuration JSON and end the stream
  child.stdin.write(configuration);
  child.stdin.end();

  // let the NodeJS application lose all references to the child process so not to wait for it
  child.unref();

  console.log('Crowd Pulse launched');
};

var executeProjectRun = function(project, run) {
  return Q.nfcall(mkdirp, config.logs.path)
    .then(function() {
      var exe = config['crowd-pulse'].main;
      var projectRunId = run._id.toString();
      var db = config.database.db;
      var jsonConfig = project.config;
      console.log('Crowd Pulse will log to:', run.log);
      return qFs.open(run.log, 'w')
        .then(function(logFile) {
          return logFile.close();
        })
        .then(function() {
          return [exe, projectRunId, run.log, db, jsonConfig];
        });
    })
    .spread(function(exe, projectRunId, log, db, jsonConfig) {
      // start crowd-pulse-core
      execute(exe, projectRunId, log, db, jsonConfig);
      return run;
    });
};

var stopProjectRun = function(run) {
  try {
    process.kill(run.pid);
  } catch (error) {
    console.warn('It looks like the run with PID ' + run.pid + ' is already stopped.');
    console.warn(error.stack);
  }
  return run;
};

module.exports = {
  execute: execute,
  executeProjectRun: executeProjectRun,
  stopProjectRun: stopProjectRun
};