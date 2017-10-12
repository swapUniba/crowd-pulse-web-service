'use strict';

var PersnalDataSchema = require('./../schema/personalData');

module.exports = function(mongoose) {
    return mongoose.model(PersnalDataSchema.statics.getSchemaName(), PersnalDataSchema);
};
