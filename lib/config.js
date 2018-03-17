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
    "androidAppBlackList": process.env.CROWD_PULSE_ANDROID_APP_BLACKLIST,
    "batch": {
      "cleaningPersonalDataTimeout": process.env.CROWD_PULSE_BATCH_CLEANING_PERSONAL_DATA_TIMEOUT,
      "crowdPulseRunTimeout": process.env.CROWD_PULSE_BATCH_RUN_TIMEOUT,
      "socialProfileTimeout": process.env.CROWD_PULSE_BATCH_SOCIAL_PROFILE_TIMEOUT,
      "demographicsTimeout": process.env.CROWD_PULSE_BATCH_DEMOGRAPHICS_TIMEOUT,
      "interestsTimeout": process.env.CROWD_PULSE_BATCH_INTERESTS_TIMEOUT

      // guide to set timeout: https://github.com/node-schedule/node-schedule#cron-style-scheduling
    }
  }
}

module.exports = jsonConfig;