'use strict';

var ConnectionSchema = require('./../schema/connection');

module.exports = function(mongoose) {
    return mongoose.model(ConnectionSchema.statics.getSchemaName(), ConnectionSchema);
};
