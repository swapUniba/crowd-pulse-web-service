'use strict';

var mongoose = require('mongoose');
var Mixed = mongoose.Schema.Types.Mixed;

/*
 * This is not a Mongoose Schema
 */
var fitbitProfileSchema = {
  fitbitId: String,
  aboutMe:String,
  avatar:String,
  city:String,
  country:String,
  dateOfBirth:String,
  displayName:String,
  fullName:String,
  gender:String,
  height:Number,
  state:String,
  weight:Number
};

module.exports = fitbitProfileSchema;