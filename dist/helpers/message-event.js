(function (global, factory) {
  if (typeof define === "function" && define.amd) {
    define(['exports', './event-prototype'], factory);
  } else if (typeof exports !== "undefined") {
    factory(exports, require('./event-prototype'));
  } else {
    var mod = {
      exports: {}
    };
    factory(mod.exports, global.eventPrototype);
    global.messageEvent = mod.exports;
  }
})(this, function (exports, _eventPrototype) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });

  var _eventPrototype2 = _interopRequireDefault(_eventPrototype);

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
      default: obj
    };
  }

  class MessageEvent extends _eventPrototype2.default {
    constructor(type, eventInitConfig = {}) {
      super();

      if (!type) {
        throw new TypeError('Failed to construct \'MessageEvent\': 1 argument required, but only 0 present.');
      }

      if (typeof eventInitConfig !== 'object') {
        throw new TypeError('Failed to construct \'MessageEvent\': parameter 2 (\'eventInitDict\') is not an object');
      }

      const {
        bubbles,
        cancelable,
        data,
        origin,
        lastEventId,
        ports
      } = eventInitConfig;

      this.type = String(type);
      this.timeStamp = Date.now();
      this.target = null;
      this.srcElement = null;
      this.returnValue = true;
      this.isTrusted = false;
      this.eventPhase = 0;
      this.defaultPrevented = false;
      this.currentTarget = null;
      this.cancelable = cancelable ? Boolean(cancelable) : false;
      this.canncelBubble = false;
      this.bubbles = bubbles ? Boolean(bubbles) : false;
      this.origin = origin ? String(origin) : '';
      this.ports = typeof ports === 'undefined' ? null : ports;
      this.data = typeof data === 'undefined' ? null : data;
      this.lastEventId = lastEventId ? String(lastEventId) : '';
    }
  }
  exports.default = MessageEvent;
});