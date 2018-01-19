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
  picture: String,
  name: String,
  about: String,
  age_range: Mixed,
  birthday: String,
  education: Mixed,
  favorite_athletes: Mixed,
  gender: String,
  hometown: Mixed,
  inspirational_people: Mixed,
  interested_in: Mixed,
  languages: Mixed,
  meeting_for: Mixed,
  political: Mixed,
  quotes: Mixed,
  relationship_status: String,
  religion: String,
  sports: Mixed,
  website: Mixed,
  work: Mixed,
  language: String
};

module.exports = facebookProfileSchema;
