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
      "projects": process.env.CROWD_PULSE_PROJECTS
    },
    "logs": {
      "path": process.env.CROWD_PULSE_LOGS_PATH
    },
    "session": {
      "secret": process.env.CROWD_PULSE_SESSION_SECRET
    },
    "batch": {
      "cleaningPersonalDataTimeout": process.env.CROWD_PULSE_BATCH_CLEANING_PERSONAL_DATA_TIMEOUT,
      "socialProfileTimeout": process.env.CROWD_PULSE_BATCH_SOCIAL_PROFILE_TIMEOUT,
      "demographicsTimeout": process.env.CROWD_PULSE_BATCH_DEMOGRAPHICS_TIMEOUT
    }
  }
}

module.exports = jsonConfig;