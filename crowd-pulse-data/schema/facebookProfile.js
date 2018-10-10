'use strict';

var mongoose = require('mongoose');
var Mixed = mongoose.Schema.Types.Mixed;

/*
 * This is not a Mongoose Schema
 */
var facebookProfileSchema = {
  facebookId: String,
  email: String,
  first_name: String,
  last_name: String,
  middle_name: String,
  picture: String,
  name: String,
  age_range: Mixed,
  gender: String,
  languages: Mixed,
  quotes: String
};

module.exports = facebookProfileSchema;
