(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(factory((global.Mock = global.Mock || {})));
}(this, (function (exports) { 'use strict';

/*
* This delay allows the thread to finish assigning its on* methods
* before invoking the delay callback. This is purely a timing hack.
* http://geekabyte.blogspot.com/2014/01/javascript-effect-of-setting-settimeout.html
*
* @param {callback: function} the callback which will be invoked after the timeout
* @parma {context: object} the context in which to invoke the function
*/
function delay(callback, context) {
  setTimeout(function (timeoutContext) { return callback.call(timeoutContext); }, 4, context);
}

function reject(array, callback) {
  var results = [];
  array.forEach(function (itemInArray) {
    if (!callback(itemInArray)) {
      results.push(itemInArray);
    }
  });

  return results;
}

function filter(array, callback) {
  var results = [];
  array.forEach(function (itemInArray) {
    if (callback(itemInArray)) {
      results.push(itemInArray);
    }
  });

  return results;
}

/*
* EventTarget is an interface implemented by objects that can
* receive events and may have listeners for them.
*
* https://developer.mozilla.org/en-US/docs/Web/API/EventTarget
*/
var EventTarget = function EventTarget() {
  this.listeners = {};
};

/*
* Ties a listener function to an event type which can later be invoked via the
* dispatchEvent method.
*
* @param {string} type - the type of event (ie: 'open', 'message', etc.)
* @param {function} listener - the callback function to invoke whenever an event is dispatched matching the given type
* @param {boolean} useCapture - N/A TODO: implement useCapture functionality
*/
EventTarget.prototype.addEventListener = function addEventListener (type, listener /* , useCapture */) {
  if (typeof listener === 'function') {
    if (!Array.isArray(this.listeners[type])) {
      this.listeners[type] = [];
    }

    // Only add the same function once
    if (filter(this.listeners[type], function (item) { return item === listener; }).length === 0) {
      this.listeners[type].push(listener);
    }
  }
};

/*
* Removes the listener so it will no longer be invoked via the dispatchEvent method.
*
* @param {string} type - the type of event (ie: 'open', 'message', etc.)
* @param {function} listener - the callback function to invoke whenever an event is dispatched matching the given type
* @param {boolean} useCapture - N/A TODO: implement useCapture functionality
*/
EventTarget.prototype.removeEventListener = function removeEventListener (type, removingListener /* , useCapture */) {
  var arrayOfListeners = this.listeners[type];
  this.listeners[type] = reject(arrayOfListeners, function (listener) { return listener === removingListener; });
};

/*
* Invokes all listener functions that are listening to the given event.type property. Each
* listener will be passed the event as the first argument.
*
* @param {object} event - event object which will be passed to all listeners of the event.type property
*/
EventTarget.prototype.dispatchEvent = function dispatchEvent (event) {
    var this$1 = this;
    var customArguments = [], len = arguments.length - 1;
    while ( len-- > 0 ) customArguments[ len ] = arguments[ len + 1 ];

  var eventName = event.type;
  var listeners = this.listeners[eventName];

  if (!Array.isArray(listeners)) {
    return false;
  }

  listeners.forEach(function (listener) {
    if (customArguments.length > 0) {
      listener.apply(this$1, customArguments);
    } else {
      listener.call(this$1, event);
    }
  });

  return true;
};

/*
* The network bridge is a way for the mock websocket object to 'communicate' with
* all available servers. This is a singleton object so it is important that you
* clean up urlMap whenever you are finished.
*/
var NetworkBridge = function NetworkBridge() {
  this.urlMap = {};
};

NetworkBridge.prototype.getConnectionLookup = function getConnectionLookup (url) {
    var this$1 = this;

  var connectionLookup = this.urlMap[url];
  if (! connectionLookup) {
      var keys = Object.keys(this.urlMap);
      var i = 0;
      while (! connectionLookup && i < keys.length) {
        if (url.startsWith(keys[i])) {
          connectionLookup = this$1.urlMap[keys[i]];
        }
        i++;
      }
  }
  return connectionLookup;
};
/*
* Attaches a websocket object to the urlMap hash so that it can find the server
* it is connected to and the server in turn can find it.
*
* @param {object} websocket - websocket object to add to the urlMap hash
* @param {string} url
*/
NetworkBridge.prototype.attachWebSocket = function attachWebSocket (websocket, url) {
  var connectionLookup = this.getConnectionLookup(url);
  if (connectionLookup && connectionLookup.server && connectionLookup.websockets.indexOf(websocket) === -1) {
    connectionLookup.websockets.push(websocket);
    return connectionLookup.server;
  }
};

/*
* Attaches a websocket to a room
*/
NetworkBridge.prototype.addMembershipToRoom = function addMembershipToRoom (websocket, room) {
  var connectionLookup = this.getConnectionLookup(websocket.url);

  if (connectionLookup && connectionLookup.server && connectionLookup.websockets.indexOf(websocket) !== -1) {
    if (!connectionLookup.roomMemberships[room]) {
      connectionLookup.roomMemberships[room] = [];
    }

    connectionLookup.roomMemberships[room].push(websocket);
  }
};

/*
* Attaches a server object to the urlMap hash so that it can find a websockets
* which are connected to it and so that websockets can in turn can find it.
*
* @param {object} server - server object to add to the urlMap hash
* @param {string} url
*/
NetworkBridge.prototype.attachServer = function attachServer (server, url) {
  var connectionLookup = this.getConnectionLookup(url);

  if (!connectionLookup) {
    this.urlMap[url] = {
      server: server,
      websockets: [],
      roomMemberships: {}
    };

    return server;
  }
};

/*
* Finds the server which is 'running' on the given url.
*
* @param {string} url - the url to use to find which server is running on it
*/
NetworkBridge.prototype.serverLookup = function serverLookup (url) {
  var connectionLookup = this.getConnectionLookup(url);

  if (connectionLookup) {
    return connectionLookup.server;
  }
};

/*
* Finds all websockets which is 'listening' on the given url.
*
* @param {string} url - the url to use to find all websockets which are associated with it
* @param {string} room - if a room is provided, will only return sockets in this room
* @param {class} broadcaster - socket that is broadcasting and is to be excluded from the lookup
*/
NetworkBridge.prototype.websocketsLookup = function websocketsLookup (url, room, broadcaster) {
  var websockets;
  var connectionLookup = this.getConnectionLookup(url);

  websockets = connectionLookup ? connectionLookup.websockets : [];

  if (room) {
    var members = connectionLookup.roomMemberships[room];
    websockets = members || [];
  }

  return broadcaster ? websockets.filter(function (websocket) { return websocket !== broadcaster; }) : websockets;
};

/*
* Removes the entry associated with the url.
*
* @param {string} url
*/
NetworkBridge.prototype.removeServer = function removeServer (url) {
  delete this.urlMap[url];
};

/*
* Removes the individual websocket from the map of associated websockets.
*
* @param {object} websocket - websocket object to remove from the url map
* @param {string} url
*/
NetworkBridge.prototype.removeWebSocket = function removeWebSocket (websocket, url) {
  var connectionLookup = this.getConnectionLookup(url);

  if (connectionLookup) {
    connectionLookup.websockets = reject(connectionLookup.websockets, function (socket) { return socket === websocket; });
  }
};

/*
* Removes a websocket from a room
*/
NetworkBridge.prototype.removeMembershipFromRoom = function removeMembershipFromRoom (websocket, room) {
  var connectionLookup = this.getConnectionLookup(websocket.url);
  var memberships = connectionLookup.roomMemberships[room];

  if (connectionLookup && memberships !== null) {
    connectionLookup.roomMemberships[room] = reject(memberships, function (socket) { return socket === websocket; });
  }
};

var networkBridge = new NetworkBridge(); // Note: this is a singleton

/*
* https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent
*/
var codes = {
  CLOSE_NORMAL: 1000,
  CLOSE_GOING_AWAY: 1001,
  CLOSE_PROTOCOL_ERROR: 1002,
  CLOSE_UNSUPPORTED: 1003,
  CLOSE_NO_STATUS: 1005,
  CLOSE_ABNORMAL: 1006,
  CLOSE_TOO_LARGE: 1009
};

function normalizeUrl(url) {
  var parts = url.split('://');
  return parts[1] && parts[1].indexOf('/') === -1 ? (url + "/") : url;
}

function log(method, message) {
  /* eslint-disable no-console */
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
    console[method].call(null, message);
  }
  /* eslint-enable no-console */
}

var EventPrototype = function EventPrototype () {};

EventPrototype.prototype.stopPropagation = function stopPropagation () {};
EventPrototype.prototype.stopImmediatePropagation = function stopImmediatePropagation () {};

// if no arguments are passed then the type is set to "undefined" on
// chrome and safari.
EventPrototype.prototype.initEvent = function initEvent (type, bubbles, cancelable) {
    if ( type === void 0 ) type = 'undefined';
    if ( bubbles === void 0 ) bubbles = false;
    if ( cancelable === void 0 ) cancelable = false;

  this.type = String(type);
  this.bubbles = Boolean(bubbles);
  this.cancelable = Boolean(cancelable);
};

var Event = (function (EventPrototype$$1) {
  function Event(type, eventInitConfig) {
    if ( eventInitConfig === void 0 ) eventInitConfig = {};

    EventPrototype$$1.call(this);

    if (!type) {
      throw new TypeError("Failed to construct 'Event': 1 argument required, but only 0 present.");
    }

    if (typeof eventInitConfig !== 'object') {
      throw new TypeError("Failed to construct 'Event': parameter 2 ('eventInitDict') is not an object");
    }

    var bubbles = eventInitConfig.bubbles;
    var cancelable = eventInitConfig.cancelable;

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
  }

  if ( EventPrototype$$1 ) Event.__proto__ = EventPrototype$$1;
  Event.prototype = Object.create( EventPrototype$$1 && EventPrototype$$1.prototype );
  Event.prototype.constructor = Event;

  return Event;
}(EventPrototype));

var MessageEvent = (function (EventPrototype$$1) {
  function MessageEvent(type, eventInitConfig) {
    if ( eventInitConfig === void 0 ) eventInitConfig = {};

    EventPrototype$$1.call(this);

    if (!type) {
      throw new TypeError("Failed to construct 'MessageEvent': 1 argument required, but only 0 present.");
    }

    if (typeof eventInitConfig !== 'object') {
      throw new TypeError("Failed to construct 'MessageEvent': parameter 2 ('eventInitDict') is not an object");
    }

    var bubbles = eventInitConfig.bubbles;
    var cancelable = eventInitConfig.cancelable;
    var data = eventInitConfig.data;
    var origin = eventInitConfig.origin;
    var lastEventId = eventInitConfig.lastEventId;
    var ports = eventInitConfig.ports;

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

  if ( EventPrototype$$1 ) MessageEvent.__proto__ = EventPrototype$$1;
  MessageEvent.prototype = Object.create( EventPrototype$$1 && EventPrototype$$1.prototype );
  MessageEvent.prototype.constructor = MessageEvent;

  return MessageEvent;
}(EventPrototype));

var CloseEvent = (function (EventPrototype$$1) {
  function CloseEvent(type, eventInitConfig) {
    if ( eventInitConfig === void 0 ) eventInitConfig = {};

    EventPrototype$$1.call(this);

    if (!type) {
      throw new TypeError("Failed to construct 'CloseEvent': 1 argument required, but only 0 present.");
    }

    if (typeof eventInitConfig !== 'object') {
      throw new TypeError("Failed to construct 'CloseEvent': parameter 2 ('eventInitDict') is not an object");
    }

    var bubbles = eventInitConfig.bubbles;
    var cancelable = eventInitConfig.cancelable;
    var code = eventInitConfig.code;
    var reason = eventInitConfig.reason;
    var wasClean = eventInitConfig.wasClean;

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
    this.code = typeof code === 'number' ? Number(code) : 0;
    this.reason = reason ? String(reason) : '';
    this.wasClean = wasClean ? Boolean(wasClean) : false;
  }

  if ( EventPrototype$$1 ) CloseEvent.__proto__ = EventPrototype$$1;
  CloseEvent.prototype = Object.create( EventPrototype$$1 && EventPrototype$$1.prototype );
  CloseEvent.prototype.constructor = CloseEvent;

  return CloseEvent;
}(EventPrototype));

/*
* Creates an Event object and extends it to allow full modification of
* its properties.
*
* @param {object} config - within config you will need to pass type and optionally target
*/
function createEvent(config) {
  var type = config.type;
  var target = config.target;
  var eventObject = new Event(type);

  if (target) {
    eventObject.target = target;
    eventObject.srcElement = target;
    eventObject.currentTarget = target;
  }

  return eventObject;
}

/*
* Creates a MessageEvent object and extends it to allow full modification of
* its properties.
*
* @param {object} config - within config: type, origin, data and optionally target
*/
function createMessageEvent(config) {
  var type = config.type;
  var origin = config.origin;
  var data = config.data;
  var target = config.target;
  var messageEvent = new MessageEvent(type, {
    data: data,
    origin: origin
  });

  if (target) {
    messageEvent.target = target;
    messageEvent.srcElement = target;
    messageEvent.currentTarget = target;
  }

  return messageEvent;
}

/*
* Creates a CloseEvent object and extends it to allow full modification of
* its properties.
*
* @param {object} config - within config: type and optionally target, code, and reason
*/
function createCloseEvent(config) {
  var code = config.code;
  var reason = config.reason;
  var type = config.type;
  var target = config.target;
  var wasClean = config.wasClean;

  if (!wasClean) {
    wasClean = code === 1000;
  }

  var closeEvent = new CloseEvent(type, {
    code: code,
    reason: reason,
    wasClean: wasClean
  });

  if (target) {
    closeEvent.target = target;
    closeEvent.srcElement = target;
    closeEvent.currentTarget = target;
  }

  return closeEvent;
}

/*
* The main websocket class which is designed to mimick the native WebSocket class as close
* as possible.
*
* https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
*/
var WebSocket$1 = (function (EventTarget$$1) {
  function WebSocket(url, protocol) {
    if ( protocol === void 0 ) protocol = '';

    EventTarget$$1.call(this);

    if (!url) {
      throw new TypeError("Failed to construct 'WebSocket': 1 argument required, but only 0 present.");
    }

    this.binaryType = 'blob';
    this.url = normalizeUrl(url);
    this.readyState = WebSocket.CONNECTING;
    this.protocol = '';

    if (typeof protocol === 'string') {
      this.protocol = protocol;
    } else if (Array.isArray(protocol) && protocol.length > 0) {
      this.protocol = protocol[0];
    }

    /*
    * In order to capture the callback function we need to define custom setters.
    * To illustrate:
    *   mySocket.onopen = function() { alert(true) };
    *
    * The only way to capture that function and hold onto it for later is with the
    * below code:
    */
    Object.defineProperties(this, {
      onopen: {
        configurable: true,
        enumerable: true,
        get: function get() {
          return this.listeners.open;
        },
        set: function set(listener) {
          this.addEventListener('open', listener);
        }
      },
      onmessage: {
        configurable: true,
        enumerable: true,
        get: function get() {
          return this.listeners.message;
        },
        set: function set(listener) {
          this.addEventListener('message', listener);
        }
      },
      onclose: {
        configurable: true,
        enumerable: true,
        get: function get() {
          return this.listeners.close;
        },
        set: function set(listener) {
          this.addEventListener('close', listener);
        }
      },
      onerror: {
        configurable: true,
        enumerable: true,
        get: function get() {
          return this.listeners.error;
        },
        set: function set(listener) {
          this.addEventListener('error', listener);
        }
      }
    });


    var server = networkBridge.attachWebSocket(this, this.url);

    /*
    * This delay is needed so that we dont trigger an event before the callbacks have been
    * setup. For example:
    *
    * var socket = new WebSocket('ws://localhost');
    *
    * // If we dont have the delay then the event would be triggered right here and this is
    * // before the onopen had a chance to register itself.
    *
    * socket.onopen = () => { // this would never be called };
    *
    * // and with the delay the event gets triggered here after all of the callbacks have been
    * // registered :-)
    */
    delay(function delayCallback() {
      if (server) {
        if (
          server.options.verifyClient &&
          typeof server.options.verifyClient === 'function' &&
          !server.options.verifyClient()
        ) {
          this.readyState = WebSocket.CLOSED;

          log(
            'error',
            ("WebSocket connection to '" + (this.url) + "' failed: HTTP Authentication failed; no valid credentials available")
          );

          networkBridge.removeWebSocket(this, this.url);
          this.dispatchEvent(createEvent({ type: 'error', target: this }));
          this.dispatchEvent(createCloseEvent({ type: 'close', target: this, code: codes.CLOSE_NORMAL }));
        } else {
          this.readyState = WebSocket.OPEN;
          this.dispatchEvent(createEvent({ type: 'open', target: this }));
          server.dispatchEvent(createEvent({ type: 'connection' }), server, this);
        }
      } else {
        this.readyState = WebSocket.CLOSED;
        this.dispatchEvent(createEvent({ type: 'error', target: this }));
        this.dispatchEvent(createCloseEvent({ type: 'close', target: this, code: codes.CLOSE_NORMAL }));

        log('error', ("WebSocket connection to '" + (this.url) + "' failed"));
      }
    }, this);
  }

  if ( EventTarget$$1 ) WebSocket.__proto__ = EventTarget$$1;
  WebSocket.prototype = Object.create( EventTarget$$1 && EventTarget$$1.prototype );
  WebSocket.prototype.constructor = WebSocket;

  /*
  * Transmits data to the server over the WebSocket connection.
  *
  * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#send()
  */
  WebSocket.prototype.send = function send (data) {
    if (this.readyState === WebSocket.CLOSING || this.readyState === WebSocket.CLOSED) {
      throw new Error('WebSocket is already in CLOSING or CLOSED state');
    }

    var messageEvent = createMessageEvent({
      type: 'message',
      origin: this.url,
      data: data
    });

    var server = networkBridge.serverLookup(this.url);

    if (server) {
      delay(function () {
        server.dispatchEvent(messageEvent, data);
      }, server);
    }
  };

  /*
  * Closes the WebSocket connection or connection attempt, if any.
  * If the connection is already CLOSED, this method does nothing.
  *
  * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#close()
  */
  WebSocket.prototype.close = function close () {
    if (this.readyState !== WebSocket.OPEN) {
      return undefined;
    }

    var server = networkBridge.serverLookup(this.url);
    var closeEvent = createCloseEvent({
      type: 'close',
      target: this,
      code: codes.CLOSE_NORMAL
    });

    networkBridge.removeWebSocket(this, this.url);

    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(closeEvent);

    if (server) {
      server.dispatchEvent(closeEvent, server);
    }
  };

  return WebSocket;
}(EventTarget));

WebSocket$1.CONNECTING = 0;
WebSocket$1.OPEN = 1;
WebSocket$1.CLOSING = 2;
WebSocket$1.CLOSED = 3;

function retrieveGlobalObject() {
  if (typeof window !== 'undefined') {
    return window;
  }

  return typeof process === 'object' && typeof require === 'function' && typeof global === 'object' ? global : this;
}

var dedupe = function (arr) { return arr.reduce(function (deduped, b) {
    if (deduped.indexOf(b) > -1) { return deduped; }
    return deduped.concat(b);
  }, []); };

/*
* https://github.com/websockets/ws#server-example
*/
var Server$1 = (function (EventTarget$$1) {
  function Server(url, options) {
    if ( options === void 0 ) options = {};

    EventTarget$$1.call(this);
    this.url = normalizeUrl(url);
    this.originalWebSocket = null;
    var server = networkBridge.attachServer(this, this.url);

    if (!server) {
      this.dispatchEvent(createEvent({ type: 'error' }));
      throw new Error('A mock server is already listening on this url');
    }

    if (typeof options.verifyClient === 'undefined') {
      options.verifyClient = null;
    }

    this.options = options;

    this.start();
  }

  if ( EventTarget$$1 ) Server.__proto__ = EventTarget$$1;
  Server.prototype = Object.create( EventTarget$$1 && EventTarget$$1.prototype );
  Server.prototype.constructor = Server;

  /*
  * Attaches the mock websocket object to the global object
  */
  Server.prototype.start = function start () {
    var globalObj = retrieveGlobalObject();

    if (globalObj.WebSocket) {
      this.originalWebSocket = globalObj.WebSocket;
    }

    globalObj.WebSocket = WebSocket$1;
  };

  /*
  * Removes the mock websocket object from the global object
  */
  Server.prototype.stop = function stop (callback) {
    if ( callback === void 0 ) callback = function () {};

    var globalObj = retrieveGlobalObject();

    if (this.originalWebSocket) {
      globalObj.WebSocket = this.originalWebSocket;
    } else {
      delete globalObj.WebSocket;
    }

    this.originalWebSocket = null;

    networkBridge.removeServer(this.url);

    if (typeof callback === 'function') {
      callback();
    }
  };

  /*
  * This is the main function for the mock server to subscribe to the on events.
  *
  * ie: mockServer.on('connection', function() { console.log('a mock client connected'); });
  *
  * @param {string} type - The event key to subscribe to. Valid keys are: connection, message, and close.
  * @param {function} callback - The callback which should be called when a certain event is fired.
  */
  Server.prototype.on = function on (type, callback) {
    this.addEventListener(type, callback);
  };

  /*
  * This send function will notify all mock clients via their onmessage callbacks that the server
  * has a message for them.
  *
  * @param {*} data - Any javascript object which will be crafted into a MessageObject.
  */
  Server.prototype.send = function send (data, options) {
    if ( options === void 0 ) options = {};

    this.emit('message', data, options);
  };

  /*
  * Sends a generic message event to all mock clients.
  */
  Server.prototype.emit = function emit (event, data, options) {
    var this$1 = this;
    if ( options === void 0 ) options = {};

    var websockets = options.websockets;

    if (!websockets) {
      websockets = networkBridge.websocketsLookup(this.url);
    }

    if (typeof options !== 'object' || arguments.length > 3) {
      data = Array.prototype.slice.call(arguments, 1, arguments.length);
    }

    websockets.forEach(function (socket) {
      if (Array.isArray(data)) {
        socket.dispatchEvent.apply(
          socket, [ createMessageEvent({
            type: event,
            data: data,
            origin: this$1.url,
            target: socket
          }) ].concat( data )
        );
      } else {
        socket.dispatchEvent(
          createMessageEvent({
            type: event,
            data: data,
            origin: this$1.url,
            target: socket
          })
        );
      }
    });
  };

  /*
  * Closes the connection and triggers the onclose method of all listening
  * websockets. After that it removes itself from the urlMap so another server
  * could add itself to the url.
  *
  * @param {object} options
  */
  Server.prototype.close = function close (options) {
    if ( options === void 0 ) options = {};

    var code = options.code;
    var reason = options.reason;
    var wasClean = options.wasClean;
    var listeners = networkBridge.websocketsLookup(this.url);

    // Remove server before notifications to prevent immediate reconnects from
    // socket onclose handlers
    networkBridge.removeServer(this.url);

    listeners.forEach(function (socket) {
      socket.readyState = WebSocket$1.CLOSE;
      socket.dispatchEvent(
        createCloseEvent({
          type: 'close',
          target: socket,
          code: code || codes.CLOSE_NORMAL,
          reason: reason || '',
          wasClean: wasClean
        })
      );
    });

    this.dispatchEvent(createCloseEvent({ type: 'close' }), this);
  };

  /*
  * Returns an array of websockets which are listening to this server
  */
  Server.prototype.clients = function clients () {
    return networkBridge.websocketsLookup(this.url);
  };

  /*
  * Prepares a method to submit an event to members of the room
  *
  * e.g. server.to('my-room').emit('hi!');
  */
  Server.prototype.to = function to (room, broadcaster, broadcastList) {
    var this$1 = this;
    if ( broadcastList === void 0 ) broadcastList = [];

    var self = this;
    var websockets = dedupe(broadcastList.concat(networkBridge.websocketsLookup(this.url, room, broadcaster)));

    return {
      to: function (chainedRoom, chainedBroadcaster) { return this$1.to.call(this$1, chainedRoom, chainedBroadcaster, websockets); },
      emit: function emit(event, data) {
        self.emit(event, data, { websockets: websockets });
      }
    };
  };

  /*
   * Alias for Server.to
   */
  Server.prototype.in = function in$1 () {
    var args = [], len = arguments.length;
    while ( len-- ) args[ len ] = arguments[ len ];

    return this.to.apply(null, args);
  };

  return Server;
}(EventTarget));

/*
 * Alternative constructor to support namespaces in socket.io
 *
 * http://socket.io/docs/rooms-and-namespaces/#custom-namespaces
 */
Server$1.of = function of(url) {
  return new Server$1(url);
};

/*
* The socket-io class is designed to mimick the real API as closely as possible.
*
* http://socket.io/docs/
*/
var SocketIO$1 = (function (EventTarget$$1) {
  function SocketIO(url, protocol) {
    var this$1 = this;
    if ( url === void 0 ) url = 'socket.io';
    if ( protocol === void 0 ) protocol = '';

    EventTarget$$1.call(this);

    this.binaryType = 'blob';
    this.url = normalizeUrl(url);
    this.readyState = SocketIO.CONNECTING;
    this.protocol = '';

    if (typeof protocol === 'string') {
      this.protocol = protocol;
    } else if (Array.isArray(protocol) && protocol.length > 0) {
      this.protocol = protocol[0];
    }

    var server = networkBridge.attachWebSocket(this, this.url);

    /*
    * Delay triggering the connection events so they can be defined in time.
    */
    delay(function delayCallback() {
      if (server) {
        this.readyState = SocketIO.OPEN;
        server.dispatchEvent(createEvent({ type: 'connection' }), server, this);
        server.dispatchEvent(createEvent({ type: 'connect' }), server, this); // alias
        this.dispatchEvent(createEvent({ type: 'connect', target: this }));
      } else {
        this.readyState = SocketIO.CLOSED;
        this.dispatchEvent(createEvent({ type: 'error', target: this }));
        this.dispatchEvent(
          createCloseEvent({
            type: 'close',
            target: this,
            code: codes.CLOSE_NORMAL
          })
        );

        log('error', ("Socket.io connection to '" + (this.url) + "' failed"));
      }
    }, this);

    /**
      Add an aliased event listener for close / disconnect
     */
    this.addEventListener('close', function (event) {
      this$1.dispatchEvent(
        createCloseEvent({
          type: 'disconnect',
          target: event.target,
          code: event.code
        })
      );
    });
  }

  if ( EventTarget$$1 ) SocketIO.__proto__ = EventTarget$$1;
  SocketIO.prototype = Object.create( EventTarget$$1 && EventTarget$$1.prototype );
  SocketIO.prototype.constructor = SocketIO;

  var prototypeAccessors = { broadcast: {} };

  /*
  * Closes the SocketIO connection or connection attempt, if any.
  * If the connection is already CLOSED, this method does nothing.
  */
  SocketIO.prototype.close = function close () {
    if (this.readyState !== SocketIO.OPEN) {
      return undefined;
    }

    var server = networkBridge.serverLookup(this.url);
    networkBridge.removeWebSocket(this, this.url);

    this.readyState = SocketIO.CLOSED;
    this.dispatchEvent(
      createCloseEvent({
        type: 'close',
        target: this,
        code: codes.CLOSE_NORMAL
      })
    );

    if (server) {
      server.dispatchEvent(
        createCloseEvent({
          type: 'disconnect',
          target: this,
          code: codes.CLOSE_NORMAL
        }),
        server
      );
    }
  };

  /*
  * Alias for Socket#close
  *
  * https://github.com/socketio/socket.io-client/blob/master/lib/socket.js#L383
  */
  SocketIO.prototype.disconnect = function disconnect () {
    this.close();
  };

  /*
  * Submits an event to the server with a payload
  */
  SocketIO.prototype.emit = function emit (event) {
    var data = [], len = arguments.length - 1;
    while ( len-- > 0 ) data[ len ] = arguments[ len + 1 ];

    if (this.readyState !== SocketIO.OPEN) {
      throw new Error('SocketIO is already in CLOSING or CLOSED state');
    }

    var messageEvent = createMessageEvent({
      type: event,
      origin: this.url,
      data: data
    });

    var server = networkBridge.serverLookup(this.url);

    if (server) {
      server.dispatchEvent.apply(server, [ messageEvent ].concat( data ));
    }
  };

  /*
  * Submits a 'message' event to the server.
  *
  * Should behave exactly like WebSocket#send
  *
  * https://github.com/socketio/socket.io-client/blob/master/lib/socket.js#L113
  */
  SocketIO.prototype.send = function send (data) {
    this.emit('message', data);
  };

  /*
  * For broadcasting events to other connected sockets.
  *
  * e.g. socket.broadcast.emit('hi!');
  * e.g. socket.broadcast.to('my-room').emit('hi!');
  */
  prototypeAccessors.broadcast.get = function () {
    if (this.readyState !== SocketIO.OPEN) {
      throw new Error('SocketIO is already in CLOSING or CLOSED state');
    }

    var self = this;
    var server = networkBridge.serverLookup(this.url);
    if (!server) {
      throw new Error(("SocketIO can not find a server at the specified URL (" + (this.url) + ")"));
    }

    return {
      emit: function emit(event, data) {
        server.emit(event, data, { websockets: networkBridge.websocketsLookup(self.url, null, self) });
      },
      to: function to(room) {
        return server.to(room, self);
      },
      in: function in$1(room) {
        return server.in(room, self);
      }
    };
  };

  /*
  * For registering events to be received from the server
  */
  SocketIO.prototype.on = function on (type, callback) {
    this.addEventListener(type, callback);
  };

  /*
   * Remove event listener
   *
   * https://socket.io/docs/client-api/#socket-on-eventname-callback
   */
  SocketIO.prototype.off = function off (type) {
    this.removeEventListener(type);
  };

  /*
   * Join a room on a server
   *
   * http://socket.io/docs/rooms-and-namespaces/#joining-and-leaving
   */
  SocketIO.prototype.join = function join (room) {
    networkBridge.addMembershipToRoom(this, room);
  };

  /*
   * Get the websocket to leave the room
   *
   * http://socket.io/docs/rooms-and-namespaces/#joining-and-leaving
   */
  SocketIO.prototype.leave = function leave (room) {
    networkBridge.removeMembershipFromRoom(this, room);
  };

  SocketIO.prototype.to = function to (room) {
    return this.broadcast.to(room);
  };

  SocketIO.prototype.in = function in$1 () {
    return this.to.apply(null, arguments);
  };

  /*
   * Invokes all listener functions that are listening to the given event.type property. Each
   * listener will be passed the event as the first argument.
   *
   * @param {object} event - event object which will be passed to all listeners of the event.type property
   */
  SocketIO.prototype.dispatchEvent = function dispatchEvent (event) {
    var this$1 = this;
    var customArguments = [], len = arguments.length - 1;
    while ( len-- > 0 ) customArguments[ len ] = arguments[ len + 1 ];

    var eventName = event.type;
    var listeners = this.listeners[eventName];

    if (!Array.isArray(listeners)) {
      return false;
    }

    listeners.forEach(function (listener) {
      if (customArguments.length > 0) {
        listener.apply(this$1, customArguments);
      } else {
        // Regular WebSockets expect a MessageEvent but Socketio.io just wants raw data
        //  payload instanceof MessageEvent works, but you can't isntance of NodeEvent
        //  for now we detect if the output has data defined on it
        listener.call(this$1, event.data ? event.data : event);
      }
    });
  };

  Object.defineProperties( SocketIO.prototype, prototypeAccessors );

  return SocketIO;
}(EventTarget));

SocketIO$1.CONNECTING = 0;
SocketIO$1.OPEN = 1;
SocketIO$1.CLOSING = 2;
SocketIO$1.CLOSED = 3;

/*
* Static constructor methods for the IO Socket
*/
var IO = function ioConstructor(url) {
  return new SocketIO$1(url);
};

/*
* Alias the raw IO() constructor
*/
IO.connect = function ioConnect(url) {
  /* eslint-disable new-cap */
  return IO(url);
  /* eslint-enable new-cap */
};

var Server = Server$1;
var WebSocket = WebSocket$1;
var SocketIO = IO;

exports.Server = Server;
exports.WebSocket = WebSocket;
exports.SocketIO = SocketIO;

Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9jay1zb2NrZXQuanMiLCJzb3VyY2VzIjpbIi4uL3NyYy9oZWxwZXJzL2RlbGF5LmpzIiwiLi4vc3JjL2hlbHBlcnMvYXJyYXktaGVscGVycy5qcyIsIi4uL3NyYy9ldmVudC10YXJnZXQuanMiLCIuLi9zcmMvbmV0d29yay1icmlkZ2UuanMiLCIuLi9zcmMvaGVscGVycy9jbG9zZS1jb2Rlcy5qcyIsIi4uL3NyYy9oZWxwZXJzL25vcm1hbGl6ZS11cmwuanMiLCIuLi9zcmMvaGVscGVycy9sb2dnZXIuanMiLCIuLi9zcmMvaGVscGVycy9ldmVudC1wcm90b3R5cGUuanMiLCIuLi9zcmMvaGVscGVycy9ldmVudC5qcyIsIi4uL3NyYy9oZWxwZXJzL21lc3NhZ2UtZXZlbnQuanMiLCIuLi9zcmMvaGVscGVycy9jbG9zZS1ldmVudC5qcyIsIi4uL3NyYy9ldmVudC1mYWN0b3J5LmpzIiwiLi4vc3JjL3dlYnNvY2tldC5qcyIsIi4uL3NyYy9oZWxwZXJzL2dsb2JhbC1vYmplY3QuanMiLCIuLi9zcmMvaGVscGVycy9kZWR1cGUuanMiLCIuLi9zcmMvc2VydmVyLmpzIiwiLi4vc3JjL3NvY2tldC1pby5qcyIsIi4uL3NyYy9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKlxyXG4qIFRoaXMgZGVsYXkgYWxsb3dzIHRoZSB0aHJlYWQgdG8gZmluaXNoIGFzc2lnbmluZyBpdHMgb24qIG1ldGhvZHNcclxuKiBiZWZvcmUgaW52b2tpbmcgdGhlIGRlbGF5IGNhbGxiYWNrLiBUaGlzIGlzIHB1cmVseSBhIHRpbWluZyBoYWNrLlxyXG4qIGh0dHA6Ly9nZWVrYWJ5dGUuYmxvZ3Nwb3QuY29tLzIwMTQvMDEvamF2YXNjcmlwdC1lZmZlY3Qtb2Ytc2V0dGluZy1zZXR0aW1lb3V0Lmh0bWxcclxuKlxyXG4qIEBwYXJhbSB7Y2FsbGJhY2s6IGZ1bmN0aW9ufSB0aGUgY2FsbGJhY2sgd2hpY2ggd2lsbCBiZSBpbnZva2VkIGFmdGVyIHRoZSB0aW1lb3V0XHJcbiogQHBhcm1hIHtjb250ZXh0OiBvYmplY3R9IHRoZSBjb250ZXh0IGluIHdoaWNoIHRvIGludm9rZSB0aGUgZnVuY3Rpb25cclxuKi9cclxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZGVsYXkoY2FsbGJhY2ssIGNvbnRleHQpIHtcclxuICBzZXRUaW1lb3V0KHRpbWVvdXRDb250ZXh0ID0+IGNhbGxiYWNrLmNhbGwodGltZW91dENvbnRleHQpLCA0LCBjb250ZXh0KTtcclxufVxyXG4iLCJleHBvcnQgZnVuY3Rpb24gcmVqZWN0KGFycmF5LCBjYWxsYmFjaykge1xyXG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcclxuICBhcnJheS5mb3JFYWNoKGl0ZW1JbkFycmF5ID0+IHtcclxuICAgIGlmICghY2FsbGJhY2soaXRlbUluQXJyYXkpKSB7XHJcbiAgICAgIHJlc3VsdHMucHVzaChpdGVtSW5BcnJheSk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHJldHVybiByZXN1bHRzO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmlsdGVyKGFycmF5LCBjYWxsYmFjaykge1xyXG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcclxuICBhcnJheS5mb3JFYWNoKGl0ZW1JbkFycmF5ID0+IHtcclxuICAgIGlmIChjYWxsYmFjayhpdGVtSW5BcnJheSkpIHtcclxuICAgICAgcmVzdWx0cy5wdXNoKGl0ZW1JbkFycmF5KTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgcmV0dXJuIHJlc3VsdHM7XHJcbn1cclxuIiwiaW1wb3J0IHsgcmVqZWN0LCBmaWx0ZXIgfSBmcm9tICcuL2hlbHBlcnMvYXJyYXktaGVscGVycyc7XHJcblxyXG4vKlxyXG4qIEV2ZW50VGFyZ2V0IGlzIGFuIGludGVyZmFjZSBpbXBsZW1lbnRlZCBieSBvYmplY3RzIHRoYXQgY2FuXHJcbiogcmVjZWl2ZSBldmVudHMgYW5kIG1heSBoYXZlIGxpc3RlbmVycyBmb3IgdGhlbS5cclxuKlxyXG4qIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9FdmVudFRhcmdldFxyXG4qL1xyXG5jbGFzcyBFdmVudFRhcmdldCB7XHJcbiAgY29uc3RydWN0b3IoKSB7XHJcbiAgICB0aGlzLmxpc3RlbmVycyA9IHt9O1xyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIFRpZXMgYSBsaXN0ZW5lciBmdW5jdGlvbiB0byBhbiBldmVudCB0eXBlIHdoaWNoIGNhbiBsYXRlciBiZSBpbnZva2VkIHZpYSB0aGVcclxuICAqIGRpc3BhdGNoRXZlbnQgbWV0aG9kLlxyXG4gICpcclxuICAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gdGhlIHR5cGUgb2YgZXZlbnQgKGllOiAnb3BlbicsICdtZXNzYWdlJywgZXRjLilcclxuICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIC0gdGhlIGNhbGxiYWNrIGZ1bmN0aW9uIHRvIGludm9rZSB3aGVuZXZlciBhbiBldmVudCBpcyBkaXNwYXRjaGVkIG1hdGNoaW5nIHRoZSBnaXZlbiB0eXBlXHJcbiAgKiBAcGFyYW0ge2Jvb2xlYW59IHVzZUNhcHR1cmUgLSBOL0EgVE9ETzogaW1wbGVtZW50IHVzZUNhcHR1cmUgZnVuY3Rpb25hbGl0eVxyXG4gICovXHJcbiAgYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lciAvKiAsIHVzZUNhcHR1cmUgKi8pIHtcclxuICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHRoaXMubGlzdGVuZXJzW3R5cGVdKSkge1xyXG4gICAgICAgIHRoaXMubGlzdGVuZXJzW3R5cGVdID0gW107XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIE9ubHkgYWRkIHRoZSBzYW1lIGZ1bmN0aW9uIG9uY2VcclxuICAgICAgaWYgKGZpbHRlcih0aGlzLmxpc3RlbmVyc1t0eXBlXSwgaXRlbSA9PiBpdGVtID09PSBsaXN0ZW5lcikubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgdGhpcy5saXN0ZW5lcnNbdHlwZV0ucHVzaChsaXN0ZW5lcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBSZW1vdmVzIHRoZSBsaXN0ZW5lciBzbyBpdCB3aWxsIG5vIGxvbmdlciBiZSBpbnZva2VkIHZpYSB0aGUgZGlzcGF0Y2hFdmVudCBtZXRob2QuXHJcbiAgKlxyXG4gICogQHBhcmFtIHtzdHJpbmd9IHR5cGUgLSB0aGUgdHlwZSBvZiBldmVudCAoaWU6ICdvcGVuJywgJ21lc3NhZ2UnLCBldGMuKVxyXG4gICogQHBhcmFtIHtmdW5jdGlvbn0gbGlzdGVuZXIgLSB0aGUgY2FsbGJhY2sgZnVuY3Rpb24gdG8gaW52b2tlIHdoZW5ldmVyIGFuIGV2ZW50IGlzIGRpc3BhdGNoZWQgbWF0Y2hpbmcgdGhlIGdpdmVuIHR5cGVcclxuICAqIEBwYXJhbSB7Ym9vbGVhbn0gdXNlQ2FwdHVyZSAtIE4vQSBUT0RPOiBpbXBsZW1lbnQgdXNlQ2FwdHVyZSBmdW5jdGlvbmFsaXR5XHJcbiAgKi9cclxuICByZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIHJlbW92aW5nTGlzdGVuZXIgLyogLCB1c2VDYXB0dXJlICovKSB7XHJcbiAgICBjb25zdCBhcnJheU9mTGlzdGVuZXJzID0gdGhpcy5saXN0ZW5lcnNbdHlwZV07XHJcbiAgICB0aGlzLmxpc3RlbmVyc1t0eXBlXSA9IHJlamVjdChhcnJheU9mTGlzdGVuZXJzLCBsaXN0ZW5lciA9PiBsaXN0ZW5lciA9PT0gcmVtb3ZpbmdMaXN0ZW5lcik7XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogSW52b2tlcyBhbGwgbGlzdGVuZXIgZnVuY3Rpb25zIHRoYXQgYXJlIGxpc3RlbmluZyB0byB0aGUgZ2l2ZW4gZXZlbnQudHlwZSBwcm9wZXJ0eS4gRWFjaFxyXG4gICogbGlzdGVuZXIgd2lsbCBiZSBwYXNzZWQgdGhlIGV2ZW50IGFzIHRoZSBmaXJzdCBhcmd1bWVudC5cclxuICAqXHJcbiAgKiBAcGFyYW0ge29iamVjdH0gZXZlbnQgLSBldmVudCBvYmplY3Qgd2hpY2ggd2lsbCBiZSBwYXNzZWQgdG8gYWxsIGxpc3RlbmVycyBvZiB0aGUgZXZlbnQudHlwZSBwcm9wZXJ0eVxyXG4gICovXHJcbiAgZGlzcGF0Y2hFdmVudChldmVudCwgLi4uY3VzdG9tQXJndW1lbnRzKSB7XHJcbiAgICBjb25zdCBldmVudE5hbWUgPSBldmVudC50eXBlO1xyXG4gICAgY29uc3QgbGlzdGVuZXJzID0gdGhpcy5saXN0ZW5lcnNbZXZlbnROYW1lXTtcclxuXHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkobGlzdGVuZXJzKSkge1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgbGlzdGVuZXJzLmZvckVhY2gobGlzdGVuZXIgPT4ge1xyXG4gICAgICBpZiAoY3VzdG9tQXJndW1lbnRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBsaXN0ZW5lci5hcHBseSh0aGlzLCBjdXN0b21Bcmd1bWVudHMpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGxpc3RlbmVyLmNhbGwodGhpcywgZXZlbnQpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IEV2ZW50VGFyZ2V0O1xyXG4iLCJpbXBvcnQgeyByZWplY3QgfSBmcm9tICcuL2hlbHBlcnMvYXJyYXktaGVscGVycyc7XHJcblxyXG4vKlxyXG4qIFRoZSBuZXR3b3JrIGJyaWRnZSBpcyBhIHdheSBmb3IgdGhlIG1vY2sgd2Vic29ja2V0IG9iamVjdCB0byAnY29tbXVuaWNhdGUnIHdpdGhcclxuKiBhbGwgYXZhaWxhYmxlIHNlcnZlcnMuIFRoaXMgaXMgYSBzaW5nbGV0b24gb2JqZWN0IHNvIGl0IGlzIGltcG9ydGFudCB0aGF0IHlvdVxyXG4qIGNsZWFuIHVwIHVybE1hcCB3aGVuZXZlciB5b3UgYXJlIGZpbmlzaGVkLlxyXG4qL1xyXG5jbGFzcyBOZXR3b3JrQnJpZGdlIHtcclxuICBjb25zdHJ1Y3RvcigpIHtcclxuICAgIHRoaXMudXJsTWFwID0ge307XHJcbiAgfVxyXG5cclxuICBnZXRDb25uZWN0aW9uTG9va3VwKHVybCkge1xyXG4gICAgbGV0IGNvbm5lY3Rpb25Mb29rdXAgPSB0aGlzLnVybE1hcFt1cmxdO1xyXG4gICAgaWYgKCEgY29ubmVjdGlvbkxvb2t1cCkge1xyXG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLnVybE1hcCk7XHJcbiAgICAgICAgbGV0IGkgPSAwO1xyXG4gICAgICAgIHdoaWxlICghIGNvbm5lY3Rpb25Mb29rdXAgJiYgaSA8IGtleXMubGVuZ3RoKSB7XHJcbiAgICAgICAgICBpZiAodXJsLnN0YXJ0c1dpdGgoa2V5c1tpXSkpIHtcclxuICAgICAgICAgICAgY29ubmVjdGlvbkxvb2t1cCA9IHRoaXMudXJsTWFwW2tleXNbaV1dO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaSsrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBjb25uZWN0aW9uTG9va3VwO1xyXG4gIH1cclxuICAvKlxyXG4gICogQXR0YWNoZXMgYSB3ZWJzb2NrZXQgb2JqZWN0IHRvIHRoZSB1cmxNYXAgaGFzaCBzbyB0aGF0IGl0IGNhbiBmaW5kIHRoZSBzZXJ2ZXJcclxuICAqIGl0IGlzIGNvbm5lY3RlZCB0byBhbmQgdGhlIHNlcnZlciBpbiB0dXJuIGNhbiBmaW5kIGl0LlxyXG4gICpcclxuICAqIEBwYXJhbSB7b2JqZWN0fSB3ZWJzb2NrZXQgLSB3ZWJzb2NrZXQgb2JqZWN0IHRvIGFkZCB0byB0aGUgdXJsTWFwIGhhc2hcclxuICAqIEBwYXJhbSB7c3RyaW5nfSB1cmxcclxuICAqL1xyXG4gIGF0dGFjaFdlYlNvY2tldCh3ZWJzb2NrZXQsIHVybCkge1xyXG4gICAgbGV0IGNvbm5lY3Rpb25Mb29rdXAgPSB0aGlzLmdldENvbm5lY3Rpb25Mb29rdXAodXJsKTtcclxuICAgIGlmIChjb25uZWN0aW9uTG9va3VwICYmIGNvbm5lY3Rpb25Mb29rdXAuc2VydmVyICYmIGNvbm5lY3Rpb25Mb29rdXAud2Vic29ja2V0cy5pbmRleE9mKHdlYnNvY2tldCkgPT09IC0xKSB7XHJcbiAgICAgIGNvbm5lY3Rpb25Mb29rdXAud2Vic29ja2V0cy5wdXNoKHdlYnNvY2tldCk7XHJcbiAgICAgIHJldHVybiBjb25uZWN0aW9uTG9va3VwLnNlcnZlcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBBdHRhY2hlcyBhIHdlYnNvY2tldCB0byBhIHJvb21cclxuICAqL1xyXG4gIGFkZE1lbWJlcnNoaXBUb1Jvb20od2Vic29ja2V0LCByb29tKSB7XHJcbiAgICBjb25zdCBjb25uZWN0aW9uTG9va3VwID0gdGhpcy5nZXRDb25uZWN0aW9uTG9va3VwKHdlYnNvY2tldC51cmwpO1xyXG5cclxuICAgIGlmIChjb25uZWN0aW9uTG9va3VwICYmIGNvbm5lY3Rpb25Mb29rdXAuc2VydmVyICYmIGNvbm5lY3Rpb25Mb29rdXAud2Vic29ja2V0cy5pbmRleE9mKHdlYnNvY2tldCkgIT09IC0xKSB7XHJcbiAgICAgIGlmICghY29ubmVjdGlvbkxvb2t1cC5yb29tTWVtYmVyc2hpcHNbcm9vbV0pIHtcclxuICAgICAgICBjb25uZWN0aW9uTG9va3VwLnJvb21NZW1iZXJzaGlwc1tyb29tXSA9IFtdO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25uZWN0aW9uTG9va3VwLnJvb21NZW1iZXJzaGlwc1tyb29tXS5wdXNoKHdlYnNvY2tldCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogQXR0YWNoZXMgYSBzZXJ2ZXIgb2JqZWN0IHRvIHRoZSB1cmxNYXAgaGFzaCBzbyB0aGF0IGl0IGNhbiBmaW5kIGEgd2Vic29ja2V0c1xyXG4gICogd2hpY2ggYXJlIGNvbm5lY3RlZCB0byBpdCBhbmQgc28gdGhhdCB3ZWJzb2NrZXRzIGNhbiBpbiB0dXJuIGNhbiBmaW5kIGl0LlxyXG4gICpcclxuICAqIEBwYXJhbSB7b2JqZWN0fSBzZXJ2ZXIgLSBzZXJ2ZXIgb2JqZWN0IHRvIGFkZCB0byB0aGUgdXJsTWFwIGhhc2hcclxuICAqIEBwYXJhbSB7c3RyaW5nfSB1cmxcclxuICAqL1xyXG4gIGF0dGFjaFNlcnZlcihzZXJ2ZXIsIHVybCkge1xyXG4gICAgY29uc3QgY29ubmVjdGlvbkxvb2t1cCA9IHRoaXMuZ2V0Q29ubmVjdGlvbkxvb2t1cCh1cmwpO1xyXG5cclxuICAgIGlmICghY29ubmVjdGlvbkxvb2t1cCkge1xyXG4gICAgICB0aGlzLnVybE1hcFt1cmxdID0ge1xyXG4gICAgICAgIHNlcnZlcixcclxuICAgICAgICB3ZWJzb2NrZXRzOiBbXSxcclxuICAgICAgICByb29tTWVtYmVyc2hpcHM6IHt9XHJcbiAgICAgIH07XHJcblxyXG4gICAgICByZXR1cm4gc2VydmVyO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIEZpbmRzIHRoZSBzZXJ2ZXIgd2hpY2ggaXMgJ3J1bm5pbmcnIG9uIHRoZSBnaXZlbiB1cmwuXHJcbiAgKlxyXG4gICogQHBhcmFtIHtzdHJpbmd9IHVybCAtIHRoZSB1cmwgdG8gdXNlIHRvIGZpbmQgd2hpY2ggc2VydmVyIGlzIHJ1bm5pbmcgb24gaXRcclxuICAqL1xyXG4gIHNlcnZlckxvb2t1cCh1cmwpIHtcclxuICAgIGNvbnN0IGNvbm5lY3Rpb25Mb29rdXAgPSB0aGlzLmdldENvbm5lY3Rpb25Mb29rdXAodXJsKTtcclxuXHJcbiAgICBpZiAoY29ubmVjdGlvbkxvb2t1cCkge1xyXG4gICAgICByZXR1cm4gY29ubmVjdGlvbkxvb2t1cC5zZXJ2ZXI7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogRmluZHMgYWxsIHdlYnNvY2tldHMgd2hpY2ggaXMgJ2xpc3RlbmluZycgb24gdGhlIGdpdmVuIHVybC5cclxuICAqXHJcbiAgKiBAcGFyYW0ge3N0cmluZ30gdXJsIC0gdGhlIHVybCB0byB1c2UgdG8gZmluZCBhbGwgd2Vic29ja2V0cyB3aGljaCBhcmUgYXNzb2NpYXRlZCB3aXRoIGl0XHJcbiAgKiBAcGFyYW0ge3N0cmluZ30gcm9vbSAtIGlmIGEgcm9vbSBpcyBwcm92aWRlZCwgd2lsbCBvbmx5IHJldHVybiBzb2NrZXRzIGluIHRoaXMgcm9vbVxyXG4gICogQHBhcmFtIHtjbGFzc30gYnJvYWRjYXN0ZXIgLSBzb2NrZXQgdGhhdCBpcyBicm9hZGNhc3RpbmcgYW5kIGlzIHRvIGJlIGV4Y2x1ZGVkIGZyb20gdGhlIGxvb2t1cFxyXG4gICovXHJcbiAgd2Vic29ja2V0c0xvb2t1cCh1cmwsIHJvb20sIGJyb2FkY2FzdGVyKSB7XHJcbiAgICBsZXQgd2Vic29ja2V0cztcclxuICAgIGNvbnN0IGNvbm5lY3Rpb25Mb29rdXAgPSB0aGlzLmdldENvbm5lY3Rpb25Mb29rdXAodXJsKTtcclxuXHJcbiAgICB3ZWJzb2NrZXRzID0gY29ubmVjdGlvbkxvb2t1cCA/IGNvbm5lY3Rpb25Mb29rdXAud2Vic29ja2V0cyA6IFtdO1xyXG5cclxuICAgIGlmIChyb29tKSB7XHJcbiAgICAgIGNvbnN0IG1lbWJlcnMgPSBjb25uZWN0aW9uTG9va3VwLnJvb21NZW1iZXJzaGlwc1tyb29tXTtcclxuICAgICAgd2Vic29ja2V0cyA9IG1lbWJlcnMgfHwgW107XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGJyb2FkY2FzdGVyID8gd2Vic29ja2V0cy5maWx0ZXIod2Vic29ja2V0ID0+IHdlYnNvY2tldCAhPT0gYnJvYWRjYXN0ZXIpIDogd2Vic29ja2V0cztcclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBSZW1vdmVzIHRoZSBlbnRyeSBhc3NvY2lhdGVkIHdpdGggdGhlIHVybC5cclxuICAqXHJcbiAgKiBAcGFyYW0ge3N0cmluZ30gdXJsXHJcbiAgKi9cclxuICByZW1vdmVTZXJ2ZXIodXJsKSB7XHJcbiAgICBkZWxldGUgdGhpcy51cmxNYXBbdXJsXTtcclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBSZW1vdmVzIHRoZSBpbmRpdmlkdWFsIHdlYnNvY2tldCBmcm9tIHRoZSBtYXAgb2YgYXNzb2NpYXRlZCB3ZWJzb2NrZXRzLlxyXG4gICpcclxuICAqIEBwYXJhbSB7b2JqZWN0fSB3ZWJzb2NrZXQgLSB3ZWJzb2NrZXQgb2JqZWN0IHRvIHJlbW92ZSBmcm9tIHRoZSB1cmwgbWFwXHJcbiAgKiBAcGFyYW0ge3N0cmluZ30gdXJsXHJcbiAgKi9cclxuICByZW1vdmVXZWJTb2NrZXQod2Vic29ja2V0LCB1cmwpIHtcclxuICAgIGNvbnN0IGNvbm5lY3Rpb25Mb29rdXAgPSB0aGlzLmdldENvbm5lY3Rpb25Mb29rdXAodXJsKTtcclxuXHJcbiAgICBpZiAoY29ubmVjdGlvbkxvb2t1cCkge1xyXG4gICAgICBjb25uZWN0aW9uTG9va3VwLndlYnNvY2tldHMgPSByZWplY3QoY29ubmVjdGlvbkxvb2t1cC53ZWJzb2NrZXRzLCBzb2NrZXQgPT4gc29ja2V0ID09PSB3ZWJzb2NrZXQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIFJlbW92ZXMgYSB3ZWJzb2NrZXQgZnJvbSBhIHJvb21cclxuICAqL1xyXG4gIHJlbW92ZU1lbWJlcnNoaXBGcm9tUm9vbSh3ZWJzb2NrZXQsIHJvb20pIHtcclxuICAgIGNvbnN0IGNvbm5lY3Rpb25Mb29rdXAgPSB0aGlzLmdldENvbm5lY3Rpb25Mb29rdXAod2Vic29ja2V0LnVybCk7XHJcbiAgICBjb25zdCBtZW1iZXJzaGlwcyA9IGNvbm5lY3Rpb25Mb29rdXAucm9vbU1lbWJlcnNoaXBzW3Jvb21dO1xyXG5cclxuICAgIGlmIChjb25uZWN0aW9uTG9va3VwICYmIG1lbWJlcnNoaXBzICE9PSBudWxsKSB7XHJcbiAgICAgIGNvbm5lY3Rpb25Mb29rdXAucm9vbU1lbWJlcnNoaXBzW3Jvb21dID0gcmVqZWN0KG1lbWJlcnNoaXBzLCBzb2NrZXQgPT4gc29ja2V0ID09PSB3ZWJzb2NrZXQpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgbmV3IE5ldHdvcmtCcmlkZ2UoKTsgLy8gTm90ZTogdGhpcyBpcyBhIHNpbmdsZXRvblxyXG4iLCIvKlxyXG4qIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9DbG9zZUV2ZW50XHJcbiovXHJcbmNvbnN0IGNvZGVzID0ge1xyXG4gIENMT1NFX05PUk1BTDogMTAwMCxcclxuICBDTE9TRV9HT0lOR19BV0FZOiAxMDAxLFxyXG4gIENMT1NFX1BST1RPQ09MX0VSUk9SOiAxMDAyLFxyXG4gIENMT1NFX1VOU1VQUE9SVEVEOiAxMDAzLFxyXG4gIENMT1NFX05PX1NUQVRVUzogMTAwNSxcclxuICBDTE9TRV9BQk5PUk1BTDogMTAwNixcclxuICBDTE9TRV9UT09fTEFSR0U6IDEwMDlcclxufTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNvZGVzO1xyXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBub3JtYWxpemVVcmwodXJsKSB7XHJcbiAgY29uc3QgcGFydHMgPSB1cmwuc3BsaXQoJzovLycpO1xyXG4gIHJldHVybiBwYXJ0c1sxXSAmJiBwYXJ0c1sxXS5pbmRleE9mKCcvJykgPT09IC0xID8gYCR7dXJsfS9gIDogdXJsO1xyXG59XHJcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGxvZyhtZXRob2QsIG1lc3NhZ2UpIHtcclxuICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXHJcbiAgaWYgKHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiBwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gJ3Rlc3QnKSB7XHJcbiAgICBjb25zb2xlW21ldGhvZF0uY2FsbChudWxsLCBtZXNzYWdlKTtcclxuICB9XHJcbiAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXHJcbn1cclxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgRXZlbnRQcm90b3R5cGUge1xyXG4gIC8vIE5vb3BzXHJcbiAgc3RvcFByb3BhZ2F0aW9uKCkge31cclxuICBzdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKSB7fVxyXG5cclxuICAvLyBpZiBubyBhcmd1bWVudHMgYXJlIHBhc3NlZCB0aGVuIHRoZSB0eXBlIGlzIHNldCB0byBcInVuZGVmaW5lZFwiIG9uXHJcbiAgLy8gY2hyb21lIGFuZCBzYWZhcmkuXHJcbiAgaW5pdEV2ZW50KHR5cGUgPSAndW5kZWZpbmVkJywgYnViYmxlcyA9IGZhbHNlLCBjYW5jZWxhYmxlID0gZmFsc2UpIHtcclxuICAgIHRoaXMudHlwZSA9IFN0cmluZyh0eXBlKTtcclxuICAgIHRoaXMuYnViYmxlcyA9IEJvb2xlYW4oYnViYmxlcyk7XHJcbiAgICB0aGlzLmNhbmNlbGFibGUgPSBCb29sZWFuKGNhbmNlbGFibGUpO1xyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQgRXZlbnRQcm90b3R5cGUgZnJvbSAnLi9ldmVudC1wcm90b3R5cGUnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRXZlbnQgZXh0ZW5kcyBFdmVudFByb3RvdHlwZSB7XHJcbiAgY29uc3RydWN0b3IodHlwZSwgZXZlbnRJbml0Q29uZmlnID0ge30pIHtcclxuICAgIHN1cGVyKCk7XHJcblxyXG4gICAgaWYgKCF0eXBlKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJGYWlsZWQgdG8gY29uc3RydWN0ICdFdmVudCc6IDEgYXJndW1lbnQgcmVxdWlyZWQsIGJ1dCBvbmx5IDAgcHJlc2VudC5cIik7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiBldmVudEluaXRDb25maWcgIT09ICdvYmplY3QnKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJGYWlsZWQgdG8gY29uc3RydWN0ICdFdmVudCc6IHBhcmFtZXRlciAyICgnZXZlbnRJbml0RGljdCcpIGlzIG5vdCBhbiBvYmplY3RcIik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgeyBidWJibGVzLCBjYW5jZWxhYmxlIH0gPSBldmVudEluaXRDb25maWc7XHJcblxyXG4gICAgdGhpcy50eXBlID0gU3RyaW5nKHR5cGUpO1xyXG4gICAgdGhpcy50aW1lU3RhbXAgPSBEYXRlLm5vdygpO1xyXG4gICAgdGhpcy50YXJnZXQgPSBudWxsO1xyXG4gICAgdGhpcy5zcmNFbGVtZW50ID0gbnVsbDtcclxuICAgIHRoaXMucmV0dXJuVmFsdWUgPSB0cnVlO1xyXG4gICAgdGhpcy5pc1RydXN0ZWQgPSBmYWxzZTtcclxuICAgIHRoaXMuZXZlbnRQaGFzZSA9IDA7XHJcbiAgICB0aGlzLmRlZmF1bHRQcmV2ZW50ZWQgPSBmYWxzZTtcclxuICAgIHRoaXMuY3VycmVudFRhcmdldCA9IG51bGw7XHJcbiAgICB0aGlzLmNhbmNlbGFibGUgPSBjYW5jZWxhYmxlID8gQm9vbGVhbihjYW5jZWxhYmxlKSA6IGZhbHNlO1xyXG4gICAgdGhpcy5jYW5uY2VsQnViYmxlID0gZmFsc2U7XHJcbiAgICB0aGlzLmJ1YmJsZXMgPSBidWJibGVzID8gQm9vbGVhbihidWJibGVzKSA6IGZhbHNlO1xyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQgRXZlbnRQcm90b3R5cGUgZnJvbSAnLi9ldmVudC1wcm90b3R5cGUnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTWVzc2FnZUV2ZW50IGV4dGVuZHMgRXZlbnRQcm90b3R5cGUge1xyXG4gIGNvbnN0cnVjdG9yKHR5cGUsIGV2ZW50SW5pdENvbmZpZyA9IHt9KSB7XHJcbiAgICBzdXBlcigpO1xyXG5cclxuICAgIGlmICghdHlwZSkge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRmFpbGVkIHRvIGNvbnN0cnVjdCAnTWVzc2FnZUV2ZW50JzogMSBhcmd1bWVudCByZXF1aXJlZCwgYnV0IG9ubHkgMCBwcmVzZW50LlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodHlwZW9mIGV2ZW50SW5pdENvbmZpZyAhPT0gJ29iamVjdCcpIHtcclxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZhaWxlZCB0byBjb25zdHJ1Y3QgJ01lc3NhZ2VFdmVudCc6IHBhcmFtZXRlciAyICgnZXZlbnRJbml0RGljdCcpIGlzIG5vdCBhbiBvYmplY3RcIik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgeyBidWJibGVzLCBjYW5jZWxhYmxlLCBkYXRhLCBvcmlnaW4sIGxhc3RFdmVudElkLCBwb3J0cyB9ID0gZXZlbnRJbml0Q29uZmlnO1xyXG5cclxuICAgIHRoaXMudHlwZSA9IFN0cmluZyh0eXBlKTtcclxuICAgIHRoaXMudGltZVN0YW1wID0gRGF0ZS5ub3coKTtcclxuICAgIHRoaXMudGFyZ2V0ID0gbnVsbDtcclxuICAgIHRoaXMuc3JjRWxlbWVudCA9IG51bGw7XHJcbiAgICB0aGlzLnJldHVyblZhbHVlID0gdHJ1ZTtcclxuICAgIHRoaXMuaXNUcnVzdGVkID0gZmFsc2U7XHJcbiAgICB0aGlzLmV2ZW50UGhhc2UgPSAwO1xyXG4gICAgdGhpcy5kZWZhdWx0UHJldmVudGVkID0gZmFsc2U7XHJcbiAgICB0aGlzLmN1cnJlbnRUYXJnZXQgPSBudWxsO1xyXG4gICAgdGhpcy5jYW5jZWxhYmxlID0gY2FuY2VsYWJsZSA/IEJvb2xlYW4oY2FuY2VsYWJsZSkgOiBmYWxzZTtcclxuICAgIHRoaXMuY2FubmNlbEJ1YmJsZSA9IGZhbHNlO1xyXG4gICAgdGhpcy5idWJibGVzID0gYnViYmxlcyA/IEJvb2xlYW4oYnViYmxlcykgOiBmYWxzZTtcclxuICAgIHRoaXMub3JpZ2luID0gb3JpZ2luID8gU3RyaW5nKG9yaWdpbikgOiAnJztcclxuICAgIHRoaXMucG9ydHMgPSB0eXBlb2YgcG9ydHMgPT09ICd1bmRlZmluZWQnID8gbnVsbCA6IHBvcnRzO1xyXG4gICAgdGhpcy5kYXRhID0gdHlwZW9mIGRhdGEgPT09ICd1bmRlZmluZWQnID8gbnVsbCA6IGRhdGE7XHJcbiAgICB0aGlzLmxhc3RFdmVudElkID0gbGFzdEV2ZW50SWQgPyBTdHJpbmcobGFzdEV2ZW50SWQpIDogJyc7XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCBFdmVudFByb3RvdHlwZSBmcm9tICcuL2V2ZW50LXByb3RvdHlwZSc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBDbG9zZUV2ZW50IGV4dGVuZHMgRXZlbnRQcm90b3R5cGUge1xyXG4gIGNvbnN0cnVjdG9yKHR5cGUsIGV2ZW50SW5pdENvbmZpZyA9IHt9KSB7XHJcbiAgICBzdXBlcigpO1xyXG5cclxuICAgIGlmICghdHlwZSkge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRmFpbGVkIHRvIGNvbnN0cnVjdCAnQ2xvc2VFdmVudCc6IDEgYXJndW1lbnQgcmVxdWlyZWQsIGJ1dCBvbmx5IDAgcHJlc2VudC5cIik7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiBldmVudEluaXRDb25maWcgIT09ICdvYmplY3QnKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJGYWlsZWQgdG8gY29uc3RydWN0ICdDbG9zZUV2ZW50JzogcGFyYW1ldGVyIDIgKCdldmVudEluaXREaWN0JykgaXMgbm90IGFuIG9iamVjdFwiKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB7IGJ1YmJsZXMsIGNhbmNlbGFibGUsIGNvZGUsIHJlYXNvbiwgd2FzQ2xlYW4gfSA9IGV2ZW50SW5pdENvbmZpZztcclxuXHJcbiAgICB0aGlzLnR5cGUgPSBTdHJpbmcodHlwZSk7XHJcbiAgICB0aGlzLnRpbWVTdGFtcCA9IERhdGUubm93KCk7XHJcbiAgICB0aGlzLnRhcmdldCA9IG51bGw7XHJcbiAgICB0aGlzLnNyY0VsZW1lbnQgPSBudWxsO1xyXG4gICAgdGhpcy5yZXR1cm5WYWx1ZSA9IHRydWU7XHJcbiAgICB0aGlzLmlzVHJ1c3RlZCA9IGZhbHNlO1xyXG4gICAgdGhpcy5ldmVudFBoYXNlID0gMDtcclxuICAgIHRoaXMuZGVmYXVsdFByZXZlbnRlZCA9IGZhbHNlO1xyXG4gICAgdGhpcy5jdXJyZW50VGFyZ2V0ID0gbnVsbDtcclxuICAgIHRoaXMuY2FuY2VsYWJsZSA9IGNhbmNlbGFibGUgPyBCb29sZWFuKGNhbmNlbGFibGUpIDogZmFsc2U7XHJcbiAgICB0aGlzLmNhbm5jZWxCdWJibGUgPSBmYWxzZTtcclxuICAgIHRoaXMuYnViYmxlcyA9IGJ1YmJsZXMgPyBCb29sZWFuKGJ1YmJsZXMpIDogZmFsc2U7XHJcbiAgICB0aGlzLmNvZGUgPSB0eXBlb2YgY29kZSA9PT0gJ251bWJlcicgPyBOdW1iZXIoY29kZSkgOiAwO1xyXG4gICAgdGhpcy5yZWFzb24gPSByZWFzb24gPyBTdHJpbmcocmVhc29uKSA6ICcnO1xyXG4gICAgdGhpcy53YXNDbGVhbiA9IHdhc0NsZWFuID8gQm9vbGVhbih3YXNDbGVhbikgOiBmYWxzZTtcclxuICB9XHJcbn1cclxuIiwiaW1wb3J0IEV2ZW50IGZyb20gJy4vaGVscGVycy9ldmVudCc7XHJcbmltcG9ydCBNZXNzYWdlRXZlbnQgZnJvbSAnLi9oZWxwZXJzL21lc3NhZ2UtZXZlbnQnO1xyXG5pbXBvcnQgQ2xvc2VFdmVudCBmcm9tICcuL2hlbHBlcnMvY2xvc2UtZXZlbnQnO1xyXG5cclxuLypcclxuKiBDcmVhdGVzIGFuIEV2ZW50IG9iamVjdCBhbmQgZXh0ZW5kcyBpdCB0byBhbGxvdyBmdWxsIG1vZGlmaWNhdGlvbiBvZlxyXG4qIGl0cyBwcm9wZXJ0aWVzLlxyXG4qXHJcbiogQHBhcmFtIHtvYmplY3R9IGNvbmZpZyAtIHdpdGhpbiBjb25maWcgeW91IHdpbGwgbmVlZCB0byBwYXNzIHR5cGUgYW5kIG9wdGlvbmFsbHkgdGFyZ2V0XHJcbiovXHJcbmZ1bmN0aW9uIGNyZWF0ZUV2ZW50KGNvbmZpZykge1xyXG4gIGNvbnN0IHsgdHlwZSwgdGFyZ2V0IH0gPSBjb25maWc7XHJcbiAgY29uc3QgZXZlbnRPYmplY3QgPSBuZXcgRXZlbnQodHlwZSk7XHJcblxyXG4gIGlmICh0YXJnZXQpIHtcclxuICAgIGV2ZW50T2JqZWN0LnRhcmdldCA9IHRhcmdldDtcclxuICAgIGV2ZW50T2JqZWN0LnNyY0VsZW1lbnQgPSB0YXJnZXQ7XHJcbiAgICBldmVudE9iamVjdC5jdXJyZW50VGFyZ2V0ID0gdGFyZ2V0O1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGV2ZW50T2JqZWN0O1xyXG59XHJcblxyXG4vKlxyXG4qIENyZWF0ZXMgYSBNZXNzYWdlRXZlbnQgb2JqZWN0IGFuZCBleHRlbmRzIGl0IHRvIGFsbG93IGZ1bGwgbW9kaWZpY2F0aW9uIG9mXHJcbiogaXRzIHByb3BlcnRpZXMuXHJcbipcclxuKiBAcGFyYW0ge29iamVjdH0gY29uZmlnIC0gd2l0aGluIGNvbmZpZzogdHlwZSwgb3JpZ2luLCBkYXRhIGFuZCBvcHRpb25hbGx5IHRhcmdldFxyXG4qL1xyXG5mdW5jdGlvbiBjcmVhdGVNZXNzYWdlRXZlbnQoY29uZmlnKSB7XHJcbiAgY29uc3QgeyB0eXBlLCBvcmlnaW4sIGRhdGEsIHRhcmdldCB9ID0gY29uZmlnO1xyXG4gIGNvbnN0IG1lc3NhZ2VFdmVudCA9IG5ldyBNZXNzYWdlRXZlbnQodHlwZSwge1xyXG4gICAgZGF0YSxcclxuICAgIG9yaWdpblxyXG4gIH0pO1xyXG5cclxuICBpZiAodGFyZ2V0KSB7XHJcbiAgICBtZXNzYWdlRXZlbnQudGFyZ2V0ID0gdGFyZ2V0O1xyXG4gICAgbWVzc2FnZUV2ZW50LnNyY0VsZW1lbnQgPSB0YXJnZXQ7XHJcbiAgICBtZXNzYWdlRXZlbnQuY3VycmVudFRhcmdldCA9IHRhcmdldDtcclxuICB9XHJcblxyXG4gIHJldHVybiBtZXNzYWdlRXZlbnQ7XHJcbn1cclxuXHJcbi8qXHJcbiogQ3JlYXRlcyBhIENsb3NlRXZlbnQgb2JqZWN0IGFuZCBleHRlbmRzIGl0IHRvIGFsbG93IGZ1bGwgbW9kaWZpY2F0aW9uIG9mXHJcbiogaXRzIHByb3BlcnRpZXMuXHJcbipcclxuKiBAcGFyYW0ge29iamVjdH0gY29uZmlnIC0gd2l0aGluIGNvbmZpZzogdHlwZSBhbmQgb3B0aW9uYWxseSB0YXJnZXQsIGNvZGUsIGFuZCByZWFzb25cclxuKi9cclxuZnVuY3Rpb24gY3JlYXRlQ2xvc2VFdmVudChjb25maWcpIHtcclxuICBjb25zdCB7IGNvZGUsIHJlYXNvbiwgdHlwZSwgdGFyZ2V0IH0gPSBjb25maWc7XHJcbiAgbGV0IHsgd2FzQ2xlYW4gfSA9IGNvbmZpZztcclxuXHJcbiAgaWYgKCF3YXNDbGVhbikge1xyXG4gICAgd2FzQ2xlYW4gPSBjb2RlID09PSAxMDAwO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgY2xvc2VFdmVudCA9IG5ldyBDbG9zZUV2ZW50KHR5cGUsIHtcclxuICAgIGNvZGUsXHJcbiAgICByZWFzb24sXHJcbiAgICB3YXNDbGVhblxyXG4gIH0pO1xyXG5cclxuICBpZiAodGFyZ2V0KSB7XHJcbiAgICBjbG9zZUV2ZW50LnRhcmdldCA9IHRhcmdldDtcclxuICAgIGNsb3NlRXZlbnQuc3JjRWxlbWVudCA9IHRhcmdldDtcclxuICAgIGNsb3NlRXZlbnQuY3VycmVudFRhcmdldCA9IHRhcmdldDtcclxuICB9XHJcblxyXG4gIHJldHVybiBjbG9zZUV2ZW50O1xyXG59XHJcblxyXG5leHBvcnQgeyBjcmVhdGVFdmVudCwgY3JlYXRlTWVzc2FnZUV2ZW50LCBjcmVhdGVDbG9zZUV2ZW50IH07XHJcbiIsImltcG9ydCBkZWxheSBmcm9tICcuL2hlbHBlcnMvZGVsYXknO1xyXG5pbXBvcnQgRXZlbnRUYXJnZXQgZnJvbSAnLi9ldmVudC10YXJnZXQnO1xyXG5pbXBvcnQgbmV0d29ya0JyaWRnZSBmcm9tICcuL25ldHdvcmstYnJpZGdlJztcclxuaW1wb3J0IENMT1NFX0NPREVTIGZyb20gJy4vaGVscGVycy9jbG9zZS1jb2Rlcyc7XHJcbmltcG9ydCBub3JtYWxpemUgZnJvbSAnLi9oZWxwZXJzL25vcm1hbGl6ZS11cmwnO1xyXG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4vaGVscGVycy9sb2dnZXInO1xyXG5pbXBvcnQgeyBjcmVhdGVFdmVudCwgY3JlYXRlTWVzc2FnZUV2ZW50LCBjcmVhdGVDbG9zZUV2ZW50IH0gZnJvbSAnLi9ldmVudC1mYWN0b3J5JztcclxuXHJcbi8qXHJcbiogVGhlIG1haW4gd2Vic29ja2V0IGNsYXNzIHdoaWNoIGlzIGRlc2lnbmVkIHRvIG1pbWljayB0aGUgbmF0aXZlIFdlYlNvY2tldCBjbGFzcyBhcyBjbG9zZVxyXG4qIGFzIHBvc3NpYmxlLlxyXG4qXHJcbiogaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL1dlYlNvY2tldFxyXG4qL1xyXG5jbGFzcyBXZWJTb2NrZXQgZXh0ZW5kcyBFdmVudFRhcmdldCB7XHJcbiAgLypcclxuICAqIEBwYXJhbSB7c3RyaW5nfSB1cmxcclxuICAqL1xyXG4gIGNvbnN0cnVjdG9yKHVybCwgcHJvdG9jb2wgPSAnJykge1xyXG4gICAgc3VwZXIoKTtcclxuXHJcbiAgICBpZiAoIXVybCkge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRmFpbGVkIHRvIGNvbnN0cnVjdCAnV2ViU29ja2V0JzogMSBhcmd1bWVudCByZXF1aXJlZCwgYnV0IG9ubHkgMCBwcmVzZW50LlwiKTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmJpbmFyeVR5cGUgPSAnYmxvYic7XHJcbiAgICB0aGlzLnVybCA9IG5vcm1hbGl6ZSh1cmwpO1xyXG4gICAgdGhpcy5yZWFkeVN0YXRlID0gV2ViU29ja2V0LkNPTk5FQ1RJTkc7XHJcbiAgICB0aGlzLnByb3RvY29sID0gJyc7XHJcblxyXG4gICAgaWYgKHR5cGVvZiBwcm90b2NvbCA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgdGhpcy5wcm90b2NvbCA9IHByb3RvY29sO1xyXG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHByb3RvY29sKSAmJiBwcm90b2NvbC5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHRoaXMucHJvdG9jb2wgPSBwcm90b2NvbFswXTtcclxuICAgIH1cclxuXHJcbiAgICAvKlxyXG4gICAgKiBJbiBvcmRlciB0byBjYXB0dXJlIHRoZSBjYWxsYmFjayBmdW5jdGlvbiB3ZSBuZWVkIHRvIGRlZmluZSBjdXN0b20gc2V0dGVycy5cclxuICAgICogVG8gaWxsdXN0cmF0ZTpcclxuICAgICogICBteVNvY2tldC5vbm9wZW4gPSBmdW5jdGlvbigpIHsgYWxlcnQodHJ1ZSkgfTtcclxuICAgICpcclxuICAgICogVGhlIG9ubHkgd2F5IHRvIGNhcHR1cmUgdGhhdCBmdW5jdGlvbiBhbmQgaG9sZCBvbnRvIGl0IGZvciBsYXRlciBpcyB3aXRoIHRoZVxyXG4gICAgKiBiZWxvdyBjb2RlOlxyXG4gICAgKi9cclxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKHRoaXMsIHtcclxuICAgICAgb25vcGVuOiB7XHJcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxyXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXHJcbiAgICAgICAgZ2V0KCkge1xyXG4gICAgICAgICAgcmV0dXJuIHRoaXMubGlzdGVuZXJzLm9wZW47XHJcbiAgICAgICAgfSxcclxuICAgICAgICBzZXQobGlzdGVuZXIpIHtcclxuICAgICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignb3BlbicsIGxpc3RlbmVyKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcbiAgICAgIG9ubWVzc2FnZToge1xyXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcclxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxyXG4gICAgICAgIGdldCgpIHtcclxuICAgICAgICAgIHJldHVybiB0aGlzLmxpc3RlbmVycy5tZXNzYWdlO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgc2V0KGxpc3RlbmVyKSB7XHJcbiAgICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBsaXN0ZW5lcik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICBvbmNsb3NlOiB7XHJcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxyXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXHJcbiAgICAgICAgZ2V0KCkge1xyXG4gICAgICAgICAgcmV0dXJuIHRoaXMubGlzdGVuZXJzLmNsb3NlO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgc2V0KGxpc3RlbmVyKSB7XHJcbiAgICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2Nsb3NlJywgbGlzdGVuZXIpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgICAgb25lcnJvcjoge1xyXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcclxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxyXG4gICAgICAgIGdldCgpIHtcclxuICAgICAgICAgIHJldHVybiB0aGlzLmxpc3RlbmVycy5lcnJvcjtcclxuICAgICAgICB9LFxyXG4gICAgICAgIHNldChsaXN0ZW5lcikge1xyXG4gICAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCdlcnJvcicsIGxpc3RlbmVyKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuXHJcbiAgICBjb25zdCBzZXJ2ZXIgPSBuZXR3b3JrQnJpZGdlLmF0dGFjaFdlYlNvY2tldCh0aGlzLCB0aGlzLnVybCk7XHJcblxyXG4gICAgLypcclxuICAgICogVGhpcyBkZWxheSBpcyBuZWVkZWQgc28gdGhhdCB3ZSBkb250IHRyaWdnZXIgYW4gZXZlbnQgYmVmb3JlIHRoZSBjYWxsYmFja3MgaGF2ZSBiZWVuXHJcbiAgICAqIHNldHVwLiBGb3IgZXhhbXBsZTpcclxuICAgICpcclxuICAgICogdmFyIHNvY2tldCA9IG5ldyBXZWJTb2NrZXQoJ3dzOi8vbG9jYWxob3N0Jyk7XHJcbiAgICAqXHJcbiAgICAqIC8vIElmIHdlIGRvbnQgaGF2ZSB0aGUgZGVsYXkgdGhlbiB0aGUgZXZlbnQgd291bGQgYmUgdHJpZ2dlcmVkIHJpZ2h0IGhlcmUgYW5kIHRoaXMgaXNcclxuICAgICogLy8gYmVmb3JlIHRoZSBvbm9wZW4gaGFkIGEgY2hhbmNlIHRvIHJlZ2lzdGVyIGl0c2VsZi5cclxuICAgICpcclxuICAgICogc29ja2V0Lm9ub3BlbiA9ICgpID0+IHsgLy8gdGhpcyB3b3VsZCBuZXZlciBiZSBjYWxsZWQgfTtcclxuICAgICpcclxuICAgICogLy8gYW5kIHdpdGggdGhlIGRlbGF5IHRoZSBldmVudCBnZXRzIHRyaWdnZXJlZCBoZXJlIGFmdGVyIGFsbCBvZiB0aGUgY2FsbGJhY2tzIGhhdmUgYmVlblxyXG4gICAgKiAvLyByZWdpc3RlcmVkIDotKVxyXG4gICAgKi9cclxuICAgIGRlbGF5KGZ1bmN0aW9uIGRlbGF5Q2FsbGJhY2soKSB7XHJcbiAgICAgIGlmIChzZXJ2ZXIpIHtcclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICBzZXJ2ZXIub3B0aW9ucy52ZXJpZnlDbGllbnQgJiZcclxuICAgICAgICAgIHR5cGVvZiBzZXJ2ZXIub3B0aW9ucy52ZXJpZnlDbGllbnQgPT09ICdmdW5jdGlvbicgJiZcclxuICAgICAgICAgICFzZXJ2ZXIub3B0aW9ucy52ZXJpZnlDbGllbnQoKVxyXG4gICAgICAgICkge1xyXG4gICAgICAgICAgdGhpcy5yZWFkeVN0YXRlID0gV2ViU29ja2V0LkNMT1NFRDtcclxuXHJcbiAgICAgICAgICBsb2dnZXIoXHJcbiAgICAgICAgICAgICdlcnJvcicsXHJcbiAgICAgICAgICAgIGBXZWJTb2NrZXQgY29ubmVjdGlvbiB0byAnJHt0aGlzLnVybH0nIGZhaWxlZDogSFRUUCBBdXRoZW50aWNhdGlvbiBmYWlsZWQ7IG5vIHZhbGlkIGNyZWRlbnRpYWxzIGF2YWlsYWJsZWBcclxuICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgbmV0d29ya0JyaWRnZS5yZW1vdmVXZWJTb2NrZXQodGhpcywgdGhpcy51cmwpO1xyXG4gICAgICAgICAgdGhpcy5kaXNwYXRjaEV2ZW50KGNyZWF0ZUV2ZW50KHsgdHlwZTogJ2Vycm9yJywgdGFyZ2V0OiB0aGlzIH0pKTtcclxuICAgICAgICAgIHRoaXMuZGlzcGF0Y2hFdmVudChjcmVhdGVDbG9zZUV2ZW50KHsgdHlwZTogJ2Nsb3NlJywgdGFyZ2V0OiB0aGlzLCBjb2RlOiBDTE9TRV9DT0RFUy5DTE9TRV9OT1JNQUwgfSkpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLnJlYWR5U3RhdGUgPSBXZWJTb2NrZXQuT1BFTjtcclxuICAgICAgICAgIHRoaXMuZGlzcGF0Y2hFdmVudChjcmVhdGVFdmVudCh7IHR5cGU6ICdvcGVuJywgdGFyZ2V0OiB0aGlzIH0pKTtcclxuICAgICAgICAgIHNlcnZlci5kaXNwYXRjaEV2ZW50KGNyZWF0ZUV2ZW50KHsgdHlwZTogJ2Nvbm5lY3Rpb24nIH0pLCBzZXJ2ZXIsIHRoaXMpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLnJlYWR5U3RhdGUgPSBXZWJTb2NrZXQuQ0xPU0VEO1xyXG4gICAgICAgIHRoaXMuZGlzcGF0Y2hFdmVudChjcmVhdGVFdmVudCh7IHR5cGU6ICdlcnJvcicsIHRhcmdldDogdGhpcyB9KSk7XHJcbiAgICAgICAgdGhpcy5kaXNwYXRjaEV2ZW50KGNyZWF0ZUNsb3NlRXZlbnQoeyB0eXBlOiAnY2xvc2UnLCB0YXJnZXQ6IHRoaXMsIGNvZGU6IENMT1NFX0NPREVTLkNMT1NFX05PUk1BTCB9KSk7XHJcblxyXG4gICAgICAgIGxvZ2dlcignZXJyb3InLCBgV2ViU29ja2V0IGNvbm5lY3Rpb24gdG8gJyR7dGhpcy51cmx9JyBmYWlsZWRgKTtcclxuICAgICAgfVxyXG4gICAgfSwgdGhpcyk7XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogVHJhbnNtaXRzIGRhdGEgdG8gdGhlIHNlcnZlciBvdmVyIHRoZSBXZWJTb2NrZXQgY29ubmVjdGlvbi5cclxuICAqXHJcbiAgKiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvV2ViU29ja2V0I3NlbmQoKVxyXG4gICovXHJcbiAgc2VuZChkYXRhKSB7XHJcbiAgICBpZiAodGhpcy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuQ0xPU0lORyB8fCB0aGlzLnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5DTE9TRUQpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdXZWJTb2NrZXQgaXMgYWxyZWFkeSBpbiBDTE9TSU5HIG9yIENMT1NFRCBzdGF0ZScpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IG1lc3NhZ2VFdmVudCA9IGNyZWF0ZU1lc3NhZ2VFdmVudCh7XHJcbiAgICAgIHR5cGU6ICdtZXNzYWdlJyxcclxuICAgICAgb3JpZ2luOiB0aGlzLnVybCxcclxuICAgICAgZGF0YVxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3Qgc2VydmVyID0gbmV0d29ya0JyaWRnZS5zZXJ2ZXJMb29rdXAodGhpcy51cmwpO1xyXG5cclxuICAgIGlmIChzZXJ2ZXIpIHtcclxuICAgICAgZGVsYXkoKCkgPT4ge1xyXG4gICAgICAgIHNlcnZlci5kaXNwYXRjaEV2ZW50KG1lc3NhZ2VFdmVudCwgZGF0YSk7XHJcbiAgICAgIH0sIHNlcnZlcik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogQ2xvc2VzIHRoZSBXZWJTb2NrZXQgY29ubmVjdGlvbiBvciBjb25uZWN0aW9uIGF0dGVtcHQsIGlmIGFueS5cclxuICAqIElmIHRoZSBjb25uZWN0aW9uIGlzIGFscmVhZHkgQ0xPU0VELCB0aGlzIG1ldGhvZCBkb2VzIG5vdGhpbmcuXHJcbiAgKlxyXG4gICogaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL1dlYlNvY2tldCNjbG9zZSgpXHJcbiAgKi9cclxuICBjbG9zZSgpIHtcclxuICAgIGlmICh0aGlzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSB7XHJcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgc2VydmVyID0gbmV0d29ya0JyaWRnZS5zZXJ2ZXJMb29rdXAodGhpcy51cmwpO1xyXG4gICAgY29uc3QgY2xvc2VFdmVudCA9IGNyZWF0ZUNsb3NlRXZlbnQoe1xyXG4gICAgICB0eXBlOiAnY2xvc2UnLFxyXG4gICAgICB0YXJnZXQ6IHRoaXMsXHJcbiAgICAgIGNvZGU6IENMT1NFX0NPREVTLkNMT1NFX05PUk1BTFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV0d29ya0JyaWRnZS5yZW1vdmVXZWJTb2NrZXQodGhpcywgdGhpcy51cmwpO1xyXG5cclxuICAgIHRoaXMucmVhZHlTdGF0ZSA9IFdlYlNvY2tldC5DTE9TRUQ7XHJcbiAgICB0aGlzLmRpc3BhdGNoRXZlbnQoY2xvc2VFdmVudCk7XHJcblxyXG4gICAgaWYgKHNlcnZlcikge1xyXG4gICAgICBzZXJ2ZXIuZGlzcGF0Y2hFdmVudChjbG9zZUV2ZW50LCBzZXJ2ZXIpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuV2ViU29ja2V0LkNPTk5FQ1RJTkcgPSAwO1xyXG5XZWJTb2NrZXQuT1BFTiA9IDE7XHJcbldlYlNvY2tldC5DTE9TSU5HID0gMjtcclxuV2ViU29ja2V0LkNMT1NFRCA9IDM7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBXZWJTb2NrZXQ7XHJcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHJldHJpZXZlR2xvYmFsT2JqZWN0KCkge1xyXG4gIGlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xyXG4gICAgcmV0dXJuIHdpbmRvdztcclxuICB9XHJcblxyXG4gIHJldHVybiB0eXBlb2YgcHJvY2VzcyA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIHJlcXVpcmUgPT09ICdmdW5jdGlvbicgJiYgdHlwZW9mIGdsb2JhbCA9PT0gJ29iamVjdCcgPyBnbG9iYWwgOiB0aGlzO1xyXG59XHJcbiIsImV4cG9ydCBkZWZhdWx0IGFyciA9PlxyXG4gIGFyci5yZWR1Y2UoKGRlZHVwZWQsIGIpID0+IHtcclxuICAgIGlmIChkZWR1cGVkLmluZGV4T2YoYikgPiAtMSkgcmV0dXJuIGRlZHVwZWQ7XHJcbiAgICByZXR1cm4gZGVkdXBlZC5jb25jYXQoYik7XHJcbiAgfSwgW10pO1xyXG4iLCJpbXBvcnQgV2ViU29ja2V0IGZyb20gJy4vd2Vic29ja2V0JztcclxuaW1wb3J0IEV2ZW50VGFyZ2V0IGZyb20gJy4vZXZlbnQtdGFyZ2V0JztcclxuaW1wb3J0IG5ldHdvcmtCcmlkZ2UgZnJvbSAnLi9uZXR3b3JrLWJyaWRnZSc7XHJcbmltcG9ydCBDTE9TRV9DT0RFUyBmcm9tICcuL2hlbHBlcnMvY2xvc2UtY29kZXMnO1xyXG5pbXBvcnQgbm9ybWFsaXplIGZyb20gJy4vaGVscGVycy9ub3JtYWxpemUtdXJsJztcclxuaW1wb3J0IGdsb2JhbE9iamVjdCBmcm9tICcuL2hlbHBlcnMvZ2xvYmFsLW9iamVjdCc7XHJcbmltcG9ydCBkZWR1cGUgZnJvbSAnLi9oZWxwZXJzL2RlZHVwZSc7XHJcbmltcG9ydCB7IGNyZWF0ZUV2ZW50LCBjcmVhdGVNZXNzYWdlRXZlbnQsIGNyZWF0ZUNsb3NlRXZlbnQgfSBmcm9tICcuL2V2ZW50LWZhY3RvcnknO1xyXG5cclxuLypcclxuKiBodHRwczovL2dpdGh1Yi5jb20vd2Vic29ja2V0cy93cyNzZXJ2ZXItZXhhbXBsZVxyXG4qL1xyXG5jbGFzcyBTZXJ2ZXIgZXh0ZW5kcyBFdmVudFRhcmdldCB7XHJcbiAgLypcclxuICAqIEBwYXJhbSB7c3RyaW5nfSB1cmxcclxuICAqL1xyXG4gIGNvbnN0cnVjdG9yKHVybCwgb3B0aW9ucyA9IHt9KSB7XHJcbiAgICBzdXBlcigpO1xyXG4gICAgdGhpcy51cmwgPSBub3JtYWxpemUodXJsKTtcclxuICAgIHRoaXMub3JpZ2luYWxXZWJTb2NrZXQgPSBudWxsO1xyXG4gICAgY29uc3Qgc2VydmVyID0gbmV0d29ya0JyaWRnZS5hdHRhY2hTZXJ2ZXIodGhpcywgdGhpcy51cmwpO1xyXG5cclxuICAgIGlmICghc2VydmVyKSB7XHJcbiAgICAgIHRoaXMuZGlzcGF0Y2hFdmVudChjcmVhdGVFdmVudCh7IHR5cGU6ICdlcnJvcicgfSkpO1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0EgbW9jayBzZXJ2ZXIgaXMgYWxyZWFkeSBsaXN0ZW5pbmcgb24gdGhpcyB1cmwnKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMudmVyaWZ5Q2xpZW50ID09PSAndW5kZWZpbmVkJykge1xyXG4gICAgICBvcHRpb25zLnZlcmlmeUNsaWVudCA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcclxuXHJcbiAgICB0aGlzLnN0YXJ0KCk7XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogQXR0YWNoZXMgdGhlIG1vY2sgd2Vic29ja2V0IG9iamVjdCB0byB0aGUgZ2xvYmFsIG9iamVjdFxyXG4gICovXHJcbiAgc3RhcnQoKSB7XHJcbiAgICBjb25zdCBnbG9iYWxPYmogPSBnbG9iYWxPYmplY3QoKTtcclxuXHJcbiAgICBpZiAoZ2xvYmFsT2JqLldlYlNvY2tldCkge1xyXG4gICAgICB0aGlzLm9yaWdpbmFsV2ViU29ja2V0ID0gZ2xvYmFsT2JqLldlYlNvY2tldDtcclxuICAgIH1cclxuXHJcbiAgICBnbG9iYWxPYmouV2ViU29ja2V0ID0gV2ViU29ja2V0O1xyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIFJlbW92ZXMgdGhlIG1vY2sgd2Vic29ja2V0IG9iamVjdCBmcm9tIHRoZSBnbG9iYWwgb2JqZWN0XHJcbiAgKi9cclxuICBzdG9wKGNhbGxiYWNrID0gKCkgPT4ge30pIHtcclxuICAgIGNvbnN0IGdsb2JhbE9iaiA9IGdsb2JhbE9iamVjdCgpO1xyXG5cclxuICAgIGlmICh0aGlzLm9yaWdpbmFsV2ViU29ja2V0KSB7XHJcbiAgICAgIGdsb2JhbE9iai5XZWJTb2NrZXQgPSB0aGlzLm9yaWdpbmFsV2ViU29ja2V0O1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZGVsZXRlIGdsb2JhbE9iai5XZWJTb2NrZXQ7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5vcmlnaW5hbFdlYlNvY2tldCA9IG51bGw7XHJcblxyXG4gICAgbmV0d29ya0JyaWRnZS5yZW1vdmVTZXJ2ZXIodGhpcy51cmwpO1xyXG5cclxuICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgY2FsbGJhY2soKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBUaGlzIGlzIHRoZSBtYWluIGZ1bmN0aW9uIGZvciB0aGUgbW9jayBzZXJ2ZXIgdG8gc3Vic2NyaWJlIHRvIHRoZSBvbiBldmVudHMuXHJcbiAgKlxyXG4gICogaWU6IG1vY2tTZXJ2ZXIub24oJ2Nvbm5lY3Rpb24nLCBmdW5jdGlvbigpIHsgY29uc29sZS5sb2coJ2EgbW9jayBjbGllbnQgY29ubmVjdGVkJyk7IH0pO1xyXG4gICpcclxuICAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gVGhlIGV2ZW50IGtleSB0byBzdWJzY3JpYmUgdG8uIFZhbGlkIGtleXMgYXJlOiBjb25uZWN0aW9uLCBtZXNzYWdlLCBhbmQgY2xvc2UuXHJcbiAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIFRoZSBjYWxsYmFjayB3aGljaCBzaG91bGQgYmUgY2FsbGVkIHdoZW4gYSBjZXJ0YWluIGV2ZW50IGlzIGZpcmVkLlxyXG4gICovXHJcbiAgb24odHlwZSwgY2FsbGJhY2spIHtcclxuICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBjYWxsYmFjayk7XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogVGhpcyBzZW5kIGZ1bmN0aW9uIHdpbGwgbm90aWZ5IGFsbCBtb2NrIGNsaWVudHMgdmlhIHRoZWlyIG9ubWVzc2FnZSBjYWxsYmFja3MgdGhhdCB0aGUgc2VydmVyXHJcbiAgKiBoYXMgYSBtZXNzYWdlIGZvciB0aGVtLlxyXG4gICpcclxuICAqIEBwYXJhbSB7Kn0gZGF0YSAtIEFueSBqYXZhc2NyaXB0IG9iamVjdCB3aGljaCB3aWxsIGJlIGNyYWZ0ZWQgaW50byBhIE1lc3NhZ2VPYmplY3QuXHJcbiAgKi9cclxuICBzZW5kKGRhdGEsIG9wdGlvbnMgPSB7fSkge1xyXG4gICAgdGhpcy5lbWl0KCdtZXNzYWdlJywgZGF0YSwgb3B0aW9ucyk7XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogU2VuZHMgYSBnZW5lcmljIG1lc3NhZ2UgZXZlbnQgdG8gYWxsIG1vY2sgY2xpZW50cy5cclxuICAqL1xyXG4gIGVtaXQoZXZlbnQsIGRhdGEsIG9wdGlvbnMgPSB7fSkge1xyXG4gICAgbGV0IHsgd2Vic29ja2V0cyB9ID0gb3B0aW9ucztcclxuXHJcbiAgICBpZiAoIXdlYnNvY2tldHMpIHtcclxuICAgICAgd2Vic29ja2V0cyA9IG5ldHdvcmtCcmlkZ2Uud2Vic29ja2V0c0xvb2t1cCh0aGlzLnVybCk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0JyB8fCBhcmd1bWVudHMubGVuZ3RoID4gMykge1xyXG4gICAgICBkYXRhID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxLCBhcmd1bWVudHMubGVuZ3RoKTtcclxuICAgIH1cclxuXHJcbiAgICB3ZWJzb2NrZXRzLmZvckVhY2goc29ja2V0ID0+IHtcclxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcclxuICAgICAgICBzb2NrZXQuZGlzcGF0Y2hFdmVudChcclxuICAgICAgICAgIGNyZWF0ZU1lc3NhZ2VFdmVudCh7XHJcbiAgICAgICAgICAgIHR5cGU6IGV2ZW50LFxyXG4gICAgICAgICAgICBkYXRhLFxyXG4gICAgICAgICAgICBvcmlnaW46IHRoaXMudXJsLFxyXG4gICAgICAgICAgICB0YXJnZXQ6IHNvY2tldFxyXG4gICAgICAgICAgfSksXHJcbiAgICAgICAgICAuLi5kYXRhXHJcbiAgICAgICAgKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBzb2NrZXQuZGlzcGF0Y2hFdmVudChcclxuICAgICAgICAgIGNyZWF0ZU1lc3NhZ2VFdmVudCh7XHJcbiAgICAgICAgICAgIHR5cGU6IGV2ZW50LFxyXG4gICAgICAgICAgICBkYXRhLFxyXG4gICAgICAgICAgICBvcmlnaW46IHRoaXMudXJsLFxyXG4gICAgICAgICAgICB0YXJnZXQ6IHNvY2tldFxyXG4gICAgICAgICAgfSlcclxuICAgICAgICApO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBDbG9zZXMgdGhlIGNvbm5lY3Rpb24gYW5kIHRyaWdnZXJzIHRoZSBvbmNsb3NlIG1ldGhvZCBvZiBhbGwgbGlzdGVuaW5nXHJcbiAgKiB3ZWJzb2NrZXRzLiBBZnRlciB0aGF0IGl0IHJlbW92ZXMgaXRzZWxmIGZyb20gdGhlIHVybE1hcCBzbyBhbm90aGVyIHNlcnZlclxyXG4gICogY291bGQgYWRkIGl0c2VsZiB0byB0aGUgdXJsLlxyXG4gICpcclxuICAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zXHJcbiAgKi9cclxuICBjbG9zZShvcHRpb25zID0ge30pIHtcclxuICAgIGNvbnN0IHsgY29kZSwgcmVhc29uLCB3YXNDbGVhbiB9ID0gb3B0aW9ucztcclxuICAgIGNvbnN0IGxpc3RlbmVycyA9IG5ldHdvcmtCcmlkZ2Uud2Vic29ja2V0c0xvb2t1cCh0aGlzLnVybCk7XHJcblxyXG4gICAgLy8gUmVtb3ZlIHNlcnZlciBiZWZvcmUgbm90aWZpY2F0aW9ucyB0byBwcmV2ZW50IGltbWVkaWF0ZSByZWNvbm5lY3RzIGZyb21cclxuICAgIC8vIHNvY2tldCBvbmNsb3NlIGhhbmRsZXJzXHJcbiAgICBuZXR3b3JrQnJpZGdlLnJlbW92ZVNlcnZlcih0aGlzLnVybCk7XHJcblxyXG4gICAgbGlzdGVuZXJzLmZvckVhY2goc29ja2V0ID0+IHtcclxuICAgICAgc29ja2V0LnJlYWR5U3RhdGUgPSBXZWJTb2NrZXQuQ0xPU0U7XHJcbiAgICAgIHNvY2tldC5kaXNwYXRjaEV2ZW50KFxyXG4gICAgICAgIGNyZWF0ZUNsb3NlRXZlbnQoe1xyXG4gICAgICAgICAgdHlwZTogJ2Nsb3NlJyxcclxuICAgICAgICAgIHRhcmdldDogc29ja2V0LFxyXG4gICAgICAgICAgY29kZTogY29kZSB8fCBDTE9TRV9DT0RFUy5DTE9TRV9OT1JNQUwsXHJcbiAgICAgICAgICByZWFzb246IHJlYXNvbiB8fCAnJyxcclxuICAgICAgICAgIHdhc0NsZWFuXHJcbiAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuZGlzcGF0Y2hFdmVudChjcmVhdGVDbG9zZUV2ZW50KHsgdHlwZTogJ2Nsb3NlJyB9KSwgdGhpcyk7XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogUmV0dXJucyBhbiBhcnJheSBvZiB3ZWJzb2NrZXRzIHdoaWNoIGFyZSBsaXN0ZW5pbmcgdG8gdGhpcyBzZXJ2ZXJcclxuICAqL1xyXG4gIGNsaWVudHMoKSB7XHJcbiAgICByZXR1cm4gbmV0d29ya0JyaWRnZS53ZWJzb2NrZXRzTG9va3VwKHRoaXMudXJsKTtcclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBQcmVwYXJlcyBhIG1ldGhvZCB0byBzdWJtaXQgYW4gZXZlbnQgdG8gbWVtYmVycyBvZiB0aGUgcm9vbVxyXG4gICpcclxuICAqIGUuZy4gc2VydmVyLnRvKCdteS1yb29tJykuZW1pdCgnaGkhJyk7XHJcbiAgKi9cclxuICB0byhyb29tLCBicm9hZGNhc3RlciwgYnJvYWRjYXN0TGlzdCA9IFtdKSB7XHJcbiAgICBjb25zdCBzZWxmID0gdGhpcztcclxuICAgIGNvbnN0IHdlYnNvY2tldHMgPSBkZWR1cGUoYnJvYWRjYXN0TGlzdC5jb25jYXQobmV0d29ya0JyaWRnZS53ZWJzb2NrZXRzTG9va3VwKHRoaXMudXJsLCByb29tLCBicm9hZGNhc3RlcikpKTtcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICB0bzogKGNoYWluZWRSb29tLCBjaGFpbmVkQnJvYWRjYXN0ZXIpID0+IHRoaXMudG8uY2FsbCh0aGlzLCBjaGFpbmVkUm9vbSwgY2hhaW5lZEJyb2FkY2FzdGVyLCB3ZWJzb2NrZXRzKSxcclxuICAgICAgZW1pdChldmVudCwgZGF0YSkge1xyXG4gICAgICAgIHNlbGYuZW1pdChldmVudCwgZGF0YSwgeyB3ZWJzb2NrZXRzIH0pO1xyXG4gICAgICB9XHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLypcclxuICAgKiBBbGlhcyBmb3IgU2VydmVyLnRvXHJcbiAgICovXHJcbiAgaW4oLi4uYXJncykge1xyXG4gICAgcmV0dXJuIHRoaXMudG8uYXBwbHkobnVsbCwgYXJncyk7XHJcbiAgfVxyXG59XHJcblxyXG4vKlxyXG4gKiBBbHRlcm5hdGl2ZSBjb25zdHJ1Y3RvciB0byBzdXBwb3J0IG5hbWVzcGFjZXMgaW4gc29ja2V0LmlvXHJcbiAqXHJcbiAqIGh0dHA6Ly9zb2NrZXQuaW8vZG9jcy9yb29tcy1hbmQtbmFtZXNwYWNlcy8jY3VzdG9tLW5hbWVzcGFjZXNcclxuICovXHJcblNlcnZlci5vZiA9IGZ1bmN0aW9uIG9mKHVybCkge1xyXG4gIHJldHVybiBuZXcgU2VydmVyKHVybCk7XHJcbn07XHJcblxyXG5leHBvcnQgZGVmYXVsdCBTZXJ2ZXI7XHJcbiIsImltcG9ydCBkZWxheSBmcm9tICcuL2hlbHBlcnMvZGVsYXknO1xyXG5pbXBvcnQgRXZlbnRUYXJnZXQgZnJvbSAnLi9ldmVudC10YXJnZXQnO1xyXG5pbXBvcnQgbmV0d29ya0JyaWRnZSBmcm9tICcuL25ldHdvcmstYnJpZGdlJztcclxuaW1wb3J0IENMT1NFX0NPREVTIGZyb20gJy4vaGVscGVycy9jbG9zZS1jb2Rlcyc7XHJcbmltcG9ydCBub3JtYWxpemUgZnJvbSAnLi9oZWxwZXJzL25vcm1hbGl6ZS11cmwnO1xyXG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4vaGVscGVycy9sb2dnZXInO1xyXG5pbXBvcnQgeyBjcmVhdGVFdmVudCwgY3JlYXRlTWVzc2FnZUV2ZW50LCBjcmVhdGVDbG9zZUV2ZW50IH0gZnJvbSAnLi9ldmVudC1mYWN0b3J5JztcclxuXHJcbi8qXHJcbiogVGhlIHNvY2tldC1pbyBjbGFzcyBpcyBkZXNpZ25lZCB0byBtaW1pY2sgdGhlIHJlYWwgQVBJIGFzIGNsb3NlbHkgYXMgcG9zc2libGUuXHJcbipcclxuKiBodHRwOi8vc29ja2V0LmlvL2RvY3MvXHJcbiovXHJcbmNsYXNzIFNvY2tldElPIGV4dGVuZHMgRXZlbnRUYXJnZXQge1xyXG4gIC8qXHJcbiAgKiBAcGFyYW0ge3N0cmluZ30gdXJsXHJcbiAgKi9cclxuICBjb25zdHJ1Y3Rvcih1cmwgPSAnc29ja2V0LmlvJywgcHJvdG9jb2wgPSAnJykge1xyXG4gICAgc3VwZXIoKTtcclxuXHJcbiAgICB0aGlzLmJpbmFyeVR5cGUgPSAnYmxvYic7XHJcbiAgICB0aGlzLnVybCA9IG5vcm1hbGl6ZSh1cmwpO1xyXG4gICAgdGhpcy5yZWFkeVN0YXRlID0gU29ja2V0SU8uQ09OTkVDVElORztcclxuICAgIHRoaXMucHJvdG9jb2wgPSAnJztcclxuXHJcbiAgICBpZiAodHlwZW9mIHByb3RvY29sID09PSAnc3RyaW5nJykge1xyXG4gICAgICB0aGlzLnByb3RvY29sID0gcHJvdG9jb2w7XHJcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkocHJvdG9jb2wpICYmIHByb3RvY29sLmxlbmd0aCA+IDApIHtcclxuICAgICAgdGhpcy5wcm90b2NvbCA9IHByb3RvY29sWzBdO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHNlcnZlciA9IG5ldHdvcmtCcmlkZ2UuYXR0YWNoV2ViU29ja2V0KHRoaXMsIHRoaXMudXJsKTtcclxuXHJcbiAgICAvKlxyXG4gICAgKiBEZWxheSB0cmlnZ2VyaW5nIHRoZSBjb25uZWN0aW9uIGV2ZW50cyBzbyB0aGV5IGNhbiBiZSBkZWZpbmVkIGluIHRpbWUuXHJcbiAgICAqL1xyXG4gICAgZGVsYXkoZnVuY3Rpb24gZGVsYXlDYWxsYmFjaygpIHtcclxuICAgICAgaWYgKHNlcnZlcikge1xyXG4gICAgICAgIHRoaXMucmVhZHlTdGF0ZSA9IFNvY2tldElPLk9QRU47XHJcbiAgICAgICAgc2VydmVyLmRpc3BhdGNoRXZlbnQoY3JlYXRlRXZlbnQoeyB0eXBlOiAnY29ubmVjdGlvbicgfSksIHNlcnZlciwgdGhpcyk7XHJcbiAgICAgICAgc2VydmVyLmRpc3BhdGNoRXZlbnQoY3JlYXRlRXZlbnQoeyB0eXBlOiAnY29ubmVjdCcgfSksIHNlcnZlciwgdGhpcyk7IC8vIGFsaWFzXHJcbiAgICAgICAgdGhpcy5kaXNwYXRjaEV2ZW50KGNyZWF0ZUV2ZW50KHsgdHlwZTogJ2Nvbm5lY3QnLCB0YXJnZXQ6IHRoaXMgfSkpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMucmVhZHlTdGF0ZSA9IFNvY2tldElPLkNMT1NFRDtcclxuICAgICAgICB0aGlzLmRpc3BhdGNoRXZlbnQoY3JlYXRlRXZlbnQoeyB0eXBlOiAnZXJyb3InLCB0YXJnZXQ6IHRoaXMgfSkpO1xyXG4gICAgICAgIHRoaXMuZGlzcGF0Y2hFdmVudChcclxuICAgICAgICAgIGNyZWF0ZUNsb3NlRXZlbnQoe1xyXG4gICAgICAgICAgICB0eXBlOiAnY2xvc2UnLFxyXG4gICAgICAgICAgICB0YXJnZXQ6IHRoaXMsXHJcbiAgICAgICAgICAgIGNvZGU6IENMT1NFX0NPREVTLkNMT1NFX05PUk1BTFxyXG4gICAgICAgICAgfSlcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBsb2dnZXIoJ2Vycm9yJywgYFNvY2tldC5pbyBjb25uZWN0aW9uIHRvICcke3RoaXMudXJsfScgZmFpbGVkYCk7XHJcbiAgICAgIH1cclxuICAgIH0sIHRoaXMpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICBBZGQgYW4gYWxpYXNlZCBldmVudCBsaXN0ZW5lciBmb3IgY2xvc2UgLyBkaXNjb25uZWN0XHJcbiAgICAgKi9cclxuICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignY2xvc2UnLCBldmVudCA9PiB7XHJcbiAgICAgIHRoaXMuZGlzcGF0Y2hFdmVudChcclxuICAgICAgICBjcmVhdGVDbG9zZUV2ZW50KHtcclxuICAgICAgICAgIHR5cGU6ICdkaXNjb25uZWN0JyxcclxuICAgICAgICAgIHRhcmdldDogZXZlbnQudGFyZ2V0LFxyXG4gICAgICAgICAgY29kZTogZXZlbnQuY29kZVxyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBDbG9zZXMgdGhlIFNvY2tldElPIGNvbm5lY3Rpb24gb3IgY29ubmVjdGlvbiBhdHRlbXB0LCBpZiBhbnkuXHJcbiAgKiBJZiB0aGUgY29ubmVjdGlvbiBpcyBhbHJlYWR5IENMT1NFRCwgdGhpcyBtZXRob2QgZG9lcyBub3RoaW5nLlxyXG4gICovXHJcbiAgY2xvc2UoKSB7XHJcbiAgICBpZiAodGhpcy5yZWFkeVN0YXRlICE9PSBTb2NrZXRJTy5PUEVOKSB7XHJcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgc2VydmVyID0gbmV0d29ya0JyaWRnZS5zZXJ2ZXJMb29rdXAodGhpcy51cmwpO1xyXG4gICAgbmV0d29ya0JyaWRnZS5yZW1vdmVXZWJTb2NrZXQodGhpcywgdGhpcy51cmwpO1xyXG5cclxuICAgIHRoaXMucmVhZHlTdGF0ZSA9IFNvY2tldElPLkNMT1NFRDtcclxuICAgIHRoaXMuZGlzcGF0Y2hFdmVudChcclxuICAgICAgY3JlYXRlQ2xvc2VFdmVudCh7XHJcbiAgICAgICAgdHlwZTogJ2Nsb3NlJyxcclxuICAgICAgICB0YXJnZXQ6IHRoaXMsXHJcbiAgICAgICAgY29kZTogQ0xPU0VfQ09ERVMuQ0xPU0VfTk9STUFMXHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG5cclxuICAgIGlmIChzZXJ2ZXIpIHtcclxuICAgICAgc2VydmVyLmRpc3BhdGNoRXZlbnQoXHJcbiAgICAgICAgY3JlYXRlQ2xvc2VFdmVudCh7XHJcbiAgICAgICAgICB0eXBlOiAnZGlzY29ubmVjdCcsXHJcbiAgICAgICAgICB0YXJnZXQ6IHRoaXMsXHJcbiAgICAgICAgICBjb2RlOiBDTE9TRV9DT0RFUy5DTE9TRV9OT1JNQUxcclxuICAgICAgICB9KSxcclxuICAgICAgICBzZXJ2ZXJcclxuICAgICAgKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBBbGlhcyBmb3IgU29ja2V0I2Nsb3NlXHJcbiAgKlxyXG4gICogaHR0cHM6Ly9naXRodWIuY29tL3NvY2tldGlvL3NvY2tldC5pby1jbGllbnQvYmxvYi9tYXN0ZXIvbGliL3NvY2tldC5qcyNMMzgzXHJcbiAgKi9cclxuICBkaXNjb25uZWN0KCkge1xyXG4gICAgdGhpcy5jbG9zZSgpO1xyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIFN1Ym1pdHMgYW4gZXZlbnQgdG8gdGhlIHNlcnZlciB3aXRoIGEgcGF5bG9hZFxyXG4gICovXHJcbiAgZW1pdChldmVudCwgLi4uZGF0YSkge1xyXG4gICAgaWYgKHRoaXMucmVhZHlTdGF0ZSAhPT0gU29ja2V0SU8uT1BFTikge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1NvY2tldElPIGlzIGFscmVhZHkgaW4gQ0xPU0lORyBvciBDTE9TRUQgc3RhdGUnKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBtZXNzYWdlRXZlbnQgPSBjcmVhdGVNZXNzYWdlRXZlbnQoe1xyXG4gICAgICB0eXBlOiBldmVudCxcclxuICAgICAgb3JpZ2luOiB0aGlzLnVybCxcclxuICAgICAgZGF0YVxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3Qgc2VydmVyID0gbmV0d29ya0JyaWRnZS5zZXJ2ZXJMb29rdXAodGhpcy51cmwpO1xyXG5cclxuICAgIGlmIChzZXJ2ZXIpIHtcclxuICAgICAgc2VydmVyLmRpc3BhdGNoRXZlbnQobWVzc2FnZUV2ZW50LCAuLi5kYXRhKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBTdWJtaXRzIGEgJ21lc3NhZ2UnIGV2ZW50IHRvIHRoZSBzZXJ2ZXIuXHJcbiAgKlxyXG4gICogU2hvdWxkIGJlaGF2ZSBleGFjdGx5IGxpa2UgV2ViU29ja2V0I3NlbmRcclxuICAqXHJcbiAgKiBodHRwczovL2dpdGh1Yi5jb20vc29ja2V0aW8vc29ja2V0LmlvLWNsaWVudC9ibG9iL21hc3Rlci9saWIvc29ja2V0LmpzI0wxMTNcclxuICAqL1xyXG4gIHNlbmQoZGF0YSkge1xyXG4gICAgdGhpcy5lbWl0KCdtZXNzYWdlJywgZGF0YSk7XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogRm9yIGJyb2FkY2FzdGluZyBldmVudHMgdG8gb3RoZXIgY29ubmVjdGVkIHNvY2tldHMuXHJcbiAgKlxyXG4gICogZS5nLiBzb2NrZXQuYnJvYWRjYXN0LmVtaXQoJ2hpIScpO1xyXG4gICogZS5nLiBzb2NrZXQuYnJvYWRjYXN0LnRvKCdteS1yb29tJykuZW1pdCgnaGkhJyk7XHJcbiAgKi9cclxuICBnZXQgYnJvYWRjYXN0KCkge1xyXG4gICAgaWYgKHRoaXMucmVhZHlTdGF0ZSAhPT0gU29ja2V0SU8uT1BFTikge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1NvY2tldElPIGlzIGFscmVhZHkgaW4gQ0xPU0lORyBvciBDTE9TRUQgc3RhdGUnKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzZWxmID0gdGhpcztcclxuICAgIGNvbnN0IHNlcnZlciA9IG5ldHdvcmtCcmlkZ2Uuc2VydmVyTG9va3VwKHRoaXMudXJsKTtcclxuICAgIGlmICghc2VydmVyKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgU29ja2V0SU8gY2FuIG5vdCBmaW5kIGEgc2VydmVyIGF0IHRoZSBzcGVjaWZpZWQgVVJMICgke3RoaXMudXJsfSlgKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBlbWl0KGV2ZW50LCBkYXRhKSB7XHJcbiAgICAgICAgc2VydmVyLmVtaXQoZXZlbnQsIGRhdGEsIHsgd2Vic29ja2V0czogbmV0d29ya0JyaWRnZS53ZWJzb2NrZXRzTG9va3VwKHNlbGYudXJsLCBudWxsLCBzZWxmKSB9KTtcclxuICAgICAgfSxcclxuICAgICAgdG8ocm9vbSkge1xyXG4gICAgICAgIHJldHVybiBzZXJ2ZXIudG8ocm9vbSwgc2VsZik7XHJcbiAgICAgIH0sXHJcbiAgICAgIGluKHJvb20pIHtcclxuICAgICAgICByZXR1cm4gc2VydmVyLmluKHJvb20sIHNlbGYpO1xyXG4gICAgICB9XHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIEZvciByZWdpc3RlcmluZyBldmVudHMgdG8gYmUgcmVjZWl2ZWQgZnJvbSB0aGUgc2VydmVyXHJcbiAgKi9cclxuICBvbih0eXBlLCBjYWxsYmFjaykge1xyXG4gICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGNhbGxiYWNrKTtcclxuICB9XHJcblxyXG4gIC8qXHJcbiAgICogUmVtb3ZlIGV2ZW50IGxpc3RlbmVyXHJcbiAgICpcclxuICAgKiBodHRwczovL3NvY2tldC5pby9kb2NzL2NsaWVudC1hcGkvI3NvY2tldC1vbi1ldmVudG5hbWUtY2FsbGJhY2tcclxuICAgKi9cclxuICBvZmYodHlwZSkge1xyXG4gICAgdGhpcy5yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUpO1xyXG4gIH1cclxuXHJcbiAgLypcclxuICAgKiBKb2luIGEgcm9vbSBvbiBhIHNlcnZlclxyXG4gICAqXHJcbiAgICogaHR0cDovL3NvY2tldC5pby9kb2NzL3Jvb21zLWFuZC1uYW1lc3BhY2VzLyNqb2luaW5nLWFuZC1sZWF2aW5nXHJcbiAgICovXHJcbiAgam9pbihyb29tKSB7XHJcbiAgICBuZXR3b3JrQnJpZGdlLmFkZE1lbWJlcnNoaXBUb1Jvb20odGhpcywgcm9vbSk7XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICAqIEdldCB0aGUgd2Vic29ja2V0IHRvIGxlYXZlIHRoZSByb29tXHJcbiAgICpcclxuICAgKiBodHRwOi8vc29ja2V0LmlvL2RvY3Mvcm9vbXMtYW5kLW5hbWVzcGFjZXMvI2pvaW5pbmctYW5kLWxlYXZpbmdcclxuICAgKi9cclxuICBsZWF2ZShyb29tKSB7XHJcbiAgICBuZXR3b3JrQnJpZGdlLnJlbW92ZU1lbWJlcnNoaXBGcm9tUm9vbSh0aGlzLCByb29tKTtcclxuICB9XHJcblxyXG4gIHRvKHJvb20pIHtcclxuICAgIHJldHVybiB0aGlzLmJyb2FkY2FzdC50byhyb29tKTtcclxuICB9XHJcblxyXG4gIGluKCkge1xyXG4gICAgcmV0dXJuIHRoaXMudG8uYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcclxuICB9XHJcblxyXG4gIC8qXHJcbiAgICogSW52b2tlcyBhbGwgbGlzdGVuZXIgZnVuY3Rpb25zIHRoYXQgYXJlIGxpc3RlbmluZyB0byB0aGUgZ2l2ZW4gZXZlbnQudHlwZSBwcm9wZXJ0eS4gRWFjaFxyXG4gICAqIGxpc3RlbmVyIHdpbGwgYmUgcGFzc2VkIHRoZSBldmVudCBhcyB0aGUgZmlyc3QgYXJndW1lbnQuXHJcbiAgICpcclxuICAgKiBAcGFyYW0ge29iamVjdH0gZXZlbnQgLSBldmVudCBvYmplY3Qgd2hpY2ggd2lsbCBiZSBwYXNzZWQgdG8gYWxsIGxpc3RlbmVycyBvZiB0aGUgZXZlbnQudHlwZSBwcm9wZXJ0eVxyXG4gICAqL1xyXG4gIGRpc3BhdGNoRXZlbnQoZXZlbnQsIC4uLmN1c3RvbUFyZ3VtZW50cykge1xyXG4gICAgY29uc3QgZXZlbnROYW1lID0gZXZlbnQudHlwZTtcclxuICAgIGNvbnN0IGxpc3RlbmVycyA9IHRoaXMubGlzdGVuZXJzW2V2ZW50TmFtZV07XHJcblxyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGxpc3RlbmVycykpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGxpc3RlbmVycy5mb3JFYWNoKGxpc3RlbmVyID0+IHtcclxuICAgICAgaWYgKGN1c3RvbUFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgbGlzdGVuZXIuYXBwbHkodGhpcywgY3VzdG9tQXJndW1lbnRzKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBSZWd1bGFyIFdlYlNvY2tldHMgZXhwZWN0IGEgTWVzc2FnZUV2ZW50IGJ1dCBTb2NrZXRpby5pbyBqdXN0IHdhbnRzIHJhdyBkYXRhXHJcbiAgICAgICAgLy8gIHBheWxvYWQgaW5zdGFuY2VvZiBNZXNzYWdlRXZlbnQgd29ya3MsIGJ1dCB5b3UgY2FuJ3QgaXNudGFuY2Ugb2YgTm9kZUV2ZW50XHJcbiAgICAgICAgLy8gIGZvciBub3cgd2UgZGV0ZWN0IGlmIHRoZSBvdXRwdXQgaGFzIGRhdGEgZGVmaW5lZCBvbiBpdFxyXG4gICAgICAgIGxpc3RlbmVyLmNhbGwodGhpcywgZXZlbnQuZGF0YSA/IGV2ZW50LmRhdGEgOiBldmVudCk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG5cclxuU29ja2V0SU8uQ09OTkVDVElORyA9IDA7XHJcblNvY2tldElPLk9QRU4gPSAxO1xyXG5Tb2NrZXRJTy5DTE9TSU5HID0gMjtcclxuU29ja2V0SU8uQ0xPU0VEID0gMztcclxuXHJcbi8qXHJcbiogU3RhdGljIGNvbnN0cnVjdG9yIG1ldGhvZHMgZm9yIHRoZSBJTyBTb2NrZXRcclxuKi9cclxuY29uc3QgSU8gPSBmdW5jdGlvbiBpb0NvbnN0cnVjdG9yKHVybCkge1xyXG4gIHJldHVybiBuZXcgU29ja2V0SU8odXJsKTtcclxufTtcclxuXHJcbi8qXHJcbiogQWxpYXMgdGhlIHJhdyBJTygpIGNvbnN0cnVjdG9yXHJcbiovXHJcbklPLmNvbm5lY3QgPSBmdW5jdGlvbiBpb0Nvbm5lY3QodXJsKSB7XHJcbiAgLyogZXNsaW50LWRpc2FibGUgbmV3LWNhcCAqL1xyXG4gIHJldHVybiBJTyh1cmwpO1xyXG4gIC8qIGVzbGludC1lbmFibGUgbmV3LWNhcCAqL1xyXG59O1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgSU87XHJcbiIsImltcG9ydCBNb2NrU2VydmVyIGZyb20gJy4vc2VydmVyJztcclxuaW1wb3J0IE1vY2tTb2NrZXRJTyBmcm9tICcuL3NvY2tldC1pbyc7XHJcbmltcG9ydCBNb2NrV2ViU29ja2V0IGZyb20gJy4vd2Vic29ja2V0JztcclxuXHJcbmV4cG9ydCBjb25zdCBTZXJ2ZXIgPSBNb2NrU2VydmVyO1xyXG5leHBvcnQgY29uc3QgV2ViU29ja2V0ID0gTW9ja1dlYlNvY2tldDtcclxuZXhwb3J0IGNvbnN0IFNvY2tldElPID0gTW9ja1NvY2tldElPO1xyXG4iXSwibmFtZXMiOlsiY29uc3QiLCJ0aGlzIiwic3VwZXIiLCJXZWJTb2NrZXQiLCJub3JtYWxpemUiLCJsb2dnZXIiLCJDTE9TRV9DT0RFUyIsIlNlcnZlciIsImdsb2JhbE9iamVjdCIsIlNvY2tldElPIiwiTW9ja1NlcnZlciIsIk1vY2tXZWJTb2NrZXQiLCJNb2NrU29ja2V0SU8iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBOzs7Ozs7OztBQVFBLEFBQWUsU0FBUyxLQUFLLENBQUMsUUFBUSxFQUFFLE9BQU8sRUFBRTtFQUMvQyxVQUFVLENBQUMsVUFBQSxjQUFjLEVBQUMsU0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFBLEVBQUUsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0NBQ3pFOztBQ1ZNLFNBQVMsTUFBTSxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUU7RUFDdENBLElBQU0sT0FBTyxHQUFHLEVBQUUsQ0FBQztFQUNuQixLQUFLLENBQUMsT0FBTyxDQUFDLFVBQUEsV0FBVyxFQUFDO0lBQ3hCLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLEVBQUU7TUFDMUIsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztLQUMzQjtHQUNGLENBQUMsQ0FBQzs7RUFFSCxPQUFPLE9BQU8sQ0FBQztDQUNoQjs7QUFFRCxBQUFPLFNBQVMsTUFBTSxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUU7RUFDdENBLElBQU0sT0FBTyxHQUFHLEVBQUUsQ0FBQztFQUNuQixLQUFLLENBQUMsT0FBTyxDQUFDLFVBQUEsV0FBVyxFQUFDO0lBQ3hCLElBQUksUUFBUSxDQUFDLFdBQVcsQ0FBQyxFQUFFO01BQ3pCLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7S0FDM0I7R0FDRixDQUFDLENBQUM7O0VBRUgsT0FBTyxPQUFPLENBQUM7Q0FDaEI7Ozs7Ozs7O0FDWkQsSUFBTSxXQUFXLEdBQUMsb0JBQ0wsR0FBRztFQUNkLElBQU0sQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO0NBQ3JCLENBQUE7Ozs7Ozs7Ozs7QUFVSCxzQkFBRSxnQkFBZ0IsOEJBQUMsSUFBSSxFQUFFLFFBQVEscUJBQXFC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
