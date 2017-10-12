'use strict';

var Q = require('q');
var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var PersonalDataSchema = builder(schemas.personalData, {
    id: mongoose.Schema.ObjectId,
    displayName: String,
    deviceId: String,
    source: String,
    latitude: Number,
    longitude: Number,
    speed: Number,
    accuracy: Number,
    packageName: String,
    category: String,
    foregroundTime: String,
    state: String,
    rxBytes: Number,
    txBytes: Number,
    networkType: String,
    timestamp: Number
});


// Model methods

PersonalDataSchema.statics.newFromObject = function(object) {
    return new this(object);
};


module.exports = PersonalDataSchema;
