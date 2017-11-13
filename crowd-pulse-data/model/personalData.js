'use strict';

var PersonalDataSchema = require('./../schema/personalData');

module.exports = function(mongoose) {
    return mongoose.model(PersonalDataSchema.statics.getSchemaName(), PersonalDataSchema);
};
