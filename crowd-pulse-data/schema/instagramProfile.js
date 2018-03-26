'use strict';

var mongoose = require('mongoose');
var Mixed = mongoose.Schema.Types.Mixed;

/*
 * This is not a Mongoose Schema
 */
var InstagramProfileSchema = {
    instagramId: String,
    username: String,
    full_name: String,
    bio: String,
    website: String,
    picture: String,
    follows: Mixed,
    followed_by: Mixed
};

module.exports = InstagramProfileSchema;
