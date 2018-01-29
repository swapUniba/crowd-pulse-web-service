'use strict';

/*
 * This is not a Mongoose Schema
 */
var LinkedInProfileSchema = {
  linkedInId: String,
  firstName: String,
  lastName: String,
  emailAddress: String,
  headline: String,
  pictureUrl: String,
  location : String,
  industry : String,
  numConnections : Number
};

module.exports = LinkedInProfileSchema;
