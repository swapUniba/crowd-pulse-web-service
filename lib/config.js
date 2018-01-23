'use strict';

var jsonConfig = {};
try {
  jsonConfig = require('../config.json');
} catch (Error) {
  // if the config file doesn't exist, use env variables
  jsonConfig = {
    "port": process.env.CROWD_PULSE_WS_PORT,
    "database": {
      "url": process.env.CROWD_PULSE_WS_MONGO_URL,
      "db": process.env.CROWD_PULSE_WS_MONGO_DB
    },
    "crowd-pulse": {
      "main": process.env.CROWD_PULSE_MAIN_EXE,
      "standardPipeline": process.env.CROWD_PULSE_STANDARD_PIPELINE
    },
    "logs": {
      "path": process.env.CROWD_PULSE_LOGS_PATH
    },
    "session": {
      "secret": process.env.CROWD_PULSE_SESSION_SECRET
    },
    "batch": {
      "timeout": process.env.CROWD_PULSE_BATCH_TIMEOUT
    }
  }
}

module.exports = jsonConfig;