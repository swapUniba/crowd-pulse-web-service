'use strict';

var Q = require('q');
var mongoose = require('mongoose');
var builder = require('./schemaBuilder');
var schemas = require('./schemaName');

var ConnectionSchema = builder(schemas.connection, {
    id: mongoose.Schema.ObjectId,
    displayName: String,
    deviceId: String,
    phoneNumber: String,
    contactId: String,
    contactName: String,
    contactPhoneNumbers: [String],
    starred: Number,
    contactedTimes: Number
});

ConnectionSchema.index({displayName: 1, deviceId: 1, contactId: 1}, { unique : true });


// Model methods

ConnectionSchema.statics.newFromObject = function(object) {
    return new this(object);
};

ConnectionSchema.statics.statContactBar = function () {
    return Q(this.aggregate(buildStatContactBarQuery()).exec());
};


var buildStatContactBarQuery = function () {
    var aggregations = [];
    aggregations.push({
        $match: {
            contactedTimes: {$exists: true}
        }
    }, {
        $project: {
            _id: false,
            name: '$contactName',
            value: '$contactedTimes'
        }
    }, {
        $sort: {
            value: -1
        }
    });

    return aggregations;
};

module.exports = ConnectionSchema;
