'use strict';

var mongoose = require('mongoose');
var Mixed = mongoose.Schema.Types.Mixed;

/*
 * This is not a Mongoose Schema
 */
var fitbitProfileSchema = {
  fitbitId: String,
  avatar:String,
  city:String,
  country:String,
  dateOfBirth:String,
  displayName:String,
  fullName:String,
  gender:String,
  height:Number,
  heightUnit:String,
  state:String,
  weight:Number,
  weightUnit:String,
  locale:String
};

module.exports = fitbitProfileSchema;