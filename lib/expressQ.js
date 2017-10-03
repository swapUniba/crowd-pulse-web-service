'use strict';

module.exports = {
  send: function(res) {
    return function(what) {
      return res.send(what);
    }
  },
  error: function(res) {
    return function(err) {
      res.status(500);
      res.send({
        error: err.name,
        message: err.message,
        stack: err.stack
      });
    }
  }
};