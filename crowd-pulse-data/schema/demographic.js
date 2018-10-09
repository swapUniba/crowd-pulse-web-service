/*
 * This is not a Mongoose Schema
 */
var demographicsSchema = {
  name: {
    value: String,
    source: String
  },
  location: [{
    value: String,
    source: String,
    confidence: Number,
    timestamp: Number
  }],
  image: [{
    value: String,
    source: String,
    confidence: Number,
    timestamp: Number
  }],
  email: [{
    value: String,
    source: String,
    confidence: Number,
    timestamp: Number
  }],
  gender: {
    value: String,
    source: String,
    confidence: Number,
    timestamp: Number
  },
  language: [{
    value: String,
    source: String,
    confidence: Number,
    timestamp: Number
  }],
  work: [{
    value: String,
    source: String,
    confidence: Number,
    timestamp: Number
  }],
  industry: [{
    value: String,
    source: String,
    confidence: Number,
    timestamp: Number
  }],
  height: [{
    value: Number,
    source: String,
    confidence: Number,
    timestamp: Number
  }],
  weight: [{
    value: Number,
    source: String,
    confidence: Number,
    timestamp: Number
  }],
  dateOfBirth: {
    value: String,
    source: String
  },
  country: [{
    value: String,
    source: String,
    confidence: Number,
    timestamp: Number
  }],
  device:  [{
    brand: String,
    model: String,
    sdk: Number,
    phoneNumbers: [String],
    source: String,
    confidence: Number,
    timestamp: Number
  }]
};

module.exports = demographicsSchema;