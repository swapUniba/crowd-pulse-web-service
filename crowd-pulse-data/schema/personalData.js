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
    foregroundTime: Number,
    state: String,
    rxBytes: Number,
    txBytes: Number,
    networkType: String,
    timestamp: Number,
    inVehicle: Number,
    onBicycle: Number,
    onFoot: Number,
    running: Number,
    still: Number,
    tilting: Number,
    walking: Number,
    unknown: Number
});


// Model methods

PersonalDataSchema.statics.newFromObject = function(object) {
    return new this(object);
};

PersonalDataSchema.statics.statPersonalDataSource = function () {
    return Q(this.aggregate(buildStatPersonalDataSourceQuery()).exec());
};

PersonalDataSchema.statics.statGPSMap = function (from, to, lat, lng, ray) {
    return Q(this.aggregate(buildStatGPSMapQuery(from, to, lat, lng, ray)).exec());
};

PersonalDataSchema.statics.statAppInfoBar = function (from, to, limitResults, groupByCategory) {
    return Q(this.aggregate(buildStatAppInfoBar(from, to, limitResults, groupByCategory)).exec());
};

PersonalDataSchema.statics.statAppInfoTimeline = function (from, to) {
    return Q(this.aggregate(buildStatAppInfoTimeline(from, to)).exec());
};

PersonalDataSchema.statics.statNetStatTimeline = function (from, to) {
    return Q(this.aggregate(buildStatNetStatTimeline(from, to)).exec());
};

PersonalDataSchema.statics.statNetStatBar = function (from, to) {
    return Q(this.aggregate(buildStatNetStatBar(from, to)).exec());
};

PersonalDataSchema.statics.statDisplayBar = function (from, to) {
    return Q(this.aggregate(buildStatDisplayBar(from, to)).exec())
        .then(function(dataArray) {
            var aggregate = [];
            var i = 0;
            while (i < dataArray.length - 1) {
                aggregate.push({
                    time: dataArray[i + 1].timestamp - dataArray[i].timestamp,
                    state: dataArray[i].state
                    }
                );
                i = i + 1;
            }

            var result = [{
                name: "totalOffTime",
                value: 0
            },{
                value: 0,
                name: "totalOnTime"
            }];

            i = 0;
            while (i < aggregate.length) {
                if (aggregate[i].state === "0") {
                    result[0].value += aggregate[i].time;
                } else {
                    result[1].value += aggregate[i].time;
                }
                i++;
            }
            return Q(result);
    });
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

var buildStatGPSMapQuery = function(from, to, lat, lng, ray) {
    var filter = undefined;

    from = new Date(from);
    to = new Date(to);
    var hasFrom = !isNaN(from.getDate());
    var hasTo = !isNaN(to.getDate());
    var hasLat = (typeof lat != 'undefined' && lat!='');
    var hasLng = (typeof lng != 'undefined' && lng!='');
    var hasRay = (typeof ray != 'undefined' && ray!='');

    if (hasFrom || hasTo || (hasLat && hasLng && hasRay)) {
        filter = {$match: {}};

        if (hasFrom || hasTo) {
            filter.$match['timestamp'] = {};
            if (hasFrom) {
                filter.$match['timestamp']['$gte'] = from.getTime();
            }
            if (hasTo) {
                filter.$match['timestamp']['$lte'] = to.getTime();
            }
        }

        if (hasLat && hasLng && hasRay) {
            lng = Number(lng);
            lat = Number(lat);
            ray = Number(ray);
            filter.$match['longitude'] = {$gt: lng - ray, $lt: lng + ray};
            filter.$match['latitude'] = {$gt: lat - ray, $lt: lat + ray};

        }
    }

    var aggregations = [];

    if (filter) {
        aggregations.push(filter);
    }

    aggregations.push({
        $match: {
            source: "gps",
            latitude: {$exists: true, $ne: 0},
            longitude: {$exists: true, $ne: 0}
        }
    }, {
        $project: {
            _id: false,
            latitude:  true,
            longitude: true,
            text: true
        }
    }, {
        $sort: {
            timestamp: 1
        }
    });

    return aggregations;
};


var buildStatAppInfoBar = function (from, to, limitResults, groupByCategory) {
    var filter = undefined;

    from = new Date(from);
    to = new Date(to);
    var hasFrom = !isNaN(from.getDate());
    var hasTo = !isNaN(to.getDate());

    if (hasFrom || hasTo) {
        filter = {$match: {}};
        filter.$match['timestamp'] = {};
        if (hasFrom) {
            filter.$match['timestamp']['$gte'] = from.getTime();
        }
        if (hasTo) {
            filter.$match['timestamp']['$lte'] = to.getTime();
        }
    }

    var aggregations = [];

    if (filter) {
        aggregations.push(filter);
    }

    // boolean value is typed as string
    if (groupByCategory === "true") {
        aggregations.push({
            $match: {
                source: "appinfo",
                foregroundTime: {$gt: 0},
                category: {$exists: true}
            }
        }, {
            $group: {
                _id: '$category',
                value: {
                    $sum: "$foregroundTime"
                }
            }

        }, {
            $sort: {value: -1}
        }, {
            $project: {
                _id: false,
                name: "$_id",
                value: true
            }
        });
    } else {
        aggregations.push({
            $match: {
                source: "appinfo",
                foregroundTime: {$gt: 0}
            }
        }, {
            $group: {
                _id: '$packageName',
                value: {
                    $sum: "$foregroundTime"
                }
            }

        }, {
            $sort: {value: -1}
        }, {
            $project: {
                _id: false,
                name: "$_id",
                value: true
            }
        });
    }

    if (limitResults) {
        aggregations.push({
            $limit: parseInt(limitResults)
        });
    }

    return aggregations;
};

var buildStatAppInfoTimeline = function (from, to) {
    var filter = undefined;

    from = new Date(from);
    to = new Date(to);
    var hasFrom = !isNaN(from.getDate());
    var hasTo = !isNaN(to.getDate());

    if (hasFrom || hasTo) {
        filter = {$match: {}};
        filter.$match['timestamp'] = {};
        if (hasFrom) {
            filter.$match['timestamp']['$gte'] = from.getTime();
        }
        if (hasTo) {
            filter.$match['timestamp']['$lte'] = to.getTime();
        }
    }

    var aggregations = [];

    if (filter) {
        aggregations.push(filter);
    }

    aggregations.push({
        $match: {
            source: "appinfo",
            foregroundTime: {$gt: 0}
        }
    },  {
        $project: {
            date: {$floor: {$divide: ["$timestamp", 86400000]}},
            packageName: "$packageName",
            foregroundTime: "$foregroundTime"
        }
    },{
        $group: {
            _id: {packageName: "$packageName", date: "$date"},
            totalForegroundTime: {$sum: "$foregroundTime"}
        }
    },{
        $group: {
            _id: "$_id.packageName",
            values: {
                $push: {
                    date: "$_id.date",
                    value: "$totalForegroundTime"
                }
            }
        }
    },  {
        $project: {
            _id: false,
            name: "$_id",
            values: true
        }
    });

    return aggregations;
};


var buildStatNetStatTimeline = function (from, to) {
    var filter = undefined;

    from = new Date(from);
    to = new Date(to);
    var hasFrom = !isNaN(from.getDate());
    var hasTo = !isNaN(to.getDate());

    if (hasFrom || hasTo) {
        filter = {$match: {}};
        filter.$match['timestamp'] = {};
        if (hasFrom) {
            filter.$match['timestamp']['$gte'] = from.getTime();
        }
        if (hasTo) {
            filter.$match['timestamp']['$lte'] = to.getTime();
        }
    }

    var aggregations = [];

    if (filter) {
        aggregations.push(filter);
    }

    aggregations.push({
        $match: {
            source: "netstats"
        }
    }, {
        $project: {
            date: {$floor: {$divide: ["$timestamp", 86400000]}},
            networkType: "$networkType",
            rxBytes: "$rxBytes",
            txBytes: "$txBytes"
        }
    },{
        $group: {
            _id: {networkType: "$networkType", date: "$date"},
            totalRxBytes: {$sum: "$rxBytes"},
            totalTxBytes: {$sum: "$txBytes"}
        }
    },{
        $group: {
            _id: "$_id.networkType",
            values: {
                $push: {
                    date: "$_id.date",
                    totalRxBytes: "$totalRxBytes",
                    totalTxBytes: "$totalTxBytes"
                }
            }
        }
    },  {
        $project: {
            _id: false,
            networkType: "$_id",
            values: true
        }
    });

    return aggregations;
};


var buildStatNetStatBar = function (from, to) {
    var filter = undefined;

    from = new Date(from);
    to = new Date(to);
    var hasFrom = !isNaN(from.getDate());
    var hasTo = !isNaN(to.getDate());

    if (hasFrom || hasTo) {
        filter = {$match: {}};
        filter.$match['timestamp'] = {};
        if (hasFrom) {
            filter.$match['timestamp']['$gte'] = from.getTime();
        }
        if (hasTo) {
            filter.$match['timestamp']['$lte'] = to.getTime();
        }
    }

    var aggregations = [];

    if (filter) {
        aggregations.push(filter);
    }

    aggregations.push({
        $match: {
            source: "netstats"
        }
    },{
        $project: {
            date: {$floor: {$divide: ["$timestamp", 86400000]}},
            networkType: "$networkType",
            rxBytes: "$rxBytes",
            txBytes: "$txBytes"
        }
    },{
        $group: {
            _id: "$networkType",
            totalRxBytes: {$sum: "$rxBytes"},
            totalTxBytes: {$sum: "$txBytes"}
        }
    },{
        $project: {
            _id: false,
            networkType: "$_id",
            totalRxBytes: true,
            totalTxBytes: true
        }
    });

    return aggregations;
};

var buildStatDisplayBar = function (from, to) {
    var filter = undefined;

    from = new Date(from);
    to = new Date(to);
    var hasFrom = !isNaN(from.getDate());
    var hasTo = !isNaN(to.getDate());

    if (hasFrom || hasTo) {
        filter = {$match: {}};
        filter.$match['timestamp'] = {};
        if (hasFrom) {
            filter.$match['timestamp']['$gte'] = from.getTime();
        }
        if (hasTo) {
            filter.$match['timestamp']['$lte'] = to.getTime();
        }
    }

    var aggregations = [];

    if (filter) {
        aggregations.push(filter);
    }

    aggregations.push({
        $match: {
            source: "display"
        }
    },{
        $sort: {timestamp: 1}
    });

    return aggregations;
};

module.exports = PersonalDataSchema;
