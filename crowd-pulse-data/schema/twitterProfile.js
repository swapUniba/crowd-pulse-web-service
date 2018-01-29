'use strict';

/*
 * This is not a Mongoose Schema
 */
var TwitterProfileSchema = {
  twitterId: String,
  name: String,
  screen_name: String,
  location: String,
  description: String,
  url: String,
  followers_count: Number,
  friends_count: Number,
  created_at: Date,
  favourites_count: Number,
  statuses_count: Number,
  profile_image_url: String,
  lang: String
};

module.exports = TwitterProfileSchema;
