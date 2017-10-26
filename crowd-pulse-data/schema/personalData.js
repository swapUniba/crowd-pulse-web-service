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


PersonalDataSchema.statics.statPersonalDataSource = function () {
    return Q(this.aggregate(buildStatPersonalDataSourceQuery()).exec());
};

var buildStatPersonalDataSourceQuery = function () {
    var aggregations = [];
    aggregations.push({
        $group: {
            _id: '$source',
            value: {
                $sum: 1
            }
        }
    }, {
        $project: {
            _id: false,
            name: '$_id',
            value: true
        }
    });

    return aggregations;
};

module.exports = PersonalDataSchema;
