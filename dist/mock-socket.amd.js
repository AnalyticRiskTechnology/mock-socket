define(['exports'], function (exports) { 'use strict';

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

});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9jay1zb2NrZXQuYW1kLmpzIiwic291cmNlcyI6WyIuLi9zcmMvaGVscGVycy9kZWxheS5qcyIsIi4uL3NyYy9oZWxwZXJzL2FycmF5LWhlbHBlcnMuanMiLCIuLi9zcmMvZXZlbnQtdGFyZ2V0LmpzIiwiLi4vc3JjL25ldHdvcmstYnJpZGdlLmpzIiwiLi4vc3JjL2hlbHBlcnMvY2xvc2UtY29kZXMuanMiLCIuLi9zcmMvaGVscGVycy9ub3JtYWxpemUtdXJsLmpzIiwiLi4vc3JjL2hlbHBlcnMvbG9nZ2VyLmpzIiwiLi4vc3JjL2hlbHBlcnMvZXZlbnQtcHJvdG90eXBlLmpzIiwiLi4vc3JjL2hlbHBlcnMvZXZlbnQuanMiLCIuLi9zcmMvaGVscGVycy9tZXNzYWdlLWV2ZW50LmpzIiwiLi4vc3JjL2hlbHBlcnMvY2xvc2UtZXZlbnQuanMiLCIuLi9zcmMvZXZlbnQtZmFjdG9yeS5qcyIsIi4uL3NyYy93ZWJzb2NrZXQuanMiLCIuLi9zcmMvaGVscGVycy9nbG9iYWwtb2JqZWN0LmpzIiwiLi4vc3JjL2hlbHBlcnMvZGVkdXBlLmpzIiwiLi4vc3JjL3NlcnZlci5qcyIsIi4uL3NyYy9zb2NrZXQtaW8uanMiLCIuLi9zcmMvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiLypcclxuKiBUaGlzIGRlbGF5IGFsbG93cyB0aGUgdGhyZWFkIHRvIGZpbmlzaCBhc3NpZ25pbmcgaXRzIG9uKiBtZXRob2RzXHJcbiogYmVmb3JlIGludm9raW5nIHRoZSBkZWxheSBjYWxsYmFjay4gVGhpcyBpcyBwdXJlbHkgYSB0aW1pbmcgaGFjay5cclxuKiBodHRwOi8vZ2Vla2FieXRlLmJsb2dzcG90LmNvbS8yMDE0LzAxL2phdmFzY3JpcHQtZWZmZWN0LW9mLXNldHRpbmctc2V0dGltZW91dC5odG1sXHJcbipcclxuKiBAcGFyYW0ge2NhbGxiYWNrOiBmdW5jdGlvbn0gdGhlIGNhbGxiYWNrIHdoaWNoIHdpbGwgYmUgaW52b2tlZCBhZnRlciB0aGUgdGltZW91dFxyXG4qIEBwYXJtYSB7Y29udGV4dDogb2JqZWN0fSB0aGUgY29udGV4dCBpbiB3aGljaCB0byBpbnZva2UgdGhlIGZ1bmN0aW9uXHJcbiovXHJcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGRlbGF5KGNhbGxiYWNrLCBjb250ZXh0KSB7XHJcbiAgc2V0VGltZW91dCh0aW1lb3V0Q29udGV4dCA9PiBjYWxsYmFjay5jYWxsKHRpbWVvdXRDb250ZXh0KSwgNCwgY29udGV4dCk7XHJcbn1cclxuIiwiZXhwb3J0IGZ1bmN0aW9uIHJlamVjdChhcnJheSwgY2FsbGJhY2spIHtcclxuICBjb25zdCByZXN1bHRzID0gW107XHJcbiAgYXJyYXkuZm9yRWFjaChpdGVtSW5BcnJheSA9PiB7XHJcbiAgICBpZiAoIWNhbGxiYWNrKGl0ZW1JbkFycmF5KSkge1xyXG4gICAgICByZXN1bHRzLnB1c2goaXRlbUluQXJyYXkpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICByZXR1cm4gcmVzdWx0cztcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbHRlcihhcnJheSwgY2FsbGJhY2spIHtcclxuICBjb25zdCByZXN1bHRzID0gW107XHJcbiAgYXJyYXkuZm9yRWFjaChpdGVtSW5BcnJheSA9PiB7XHJcbiAgICBpZiAoY2FsbGJhY2soaXRlbUluQXJyYXkpKSB7XHJcbiAgICAgIHJlc3VsdHMucHVzaChpdGVtSW5BcnJheSk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHJldHVybiByZXN1bHRzO1xyXG59XHJcbiIsImltcG9ydCB7IHJlamVjdCwgZmlsdGVyIH0gZnJvbSAnLi9oZWxwZXJzL2FycmF5LWhlbHBlcnMnO1xyXG5cclxuLypcclxuKiBFdmVudFRhcmdldCBpcyBhbiBpbnRlcmZhY2UgaW1wbGVtZW50ZWQgYnkgb2JqZWN0cyB0aGF0IGNhblxyXG4qIHJlY2VpdmUgZXZlbnRzIGFuZCBtYXkgaGF2ZSBsaXN0ZW5lcnMgZm9yIHRoZW0uXHJcbipcclxuKiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvRXZlbnRUYXJnZXRcclxuKi9cclxuY2xhc3MgRXZlbnRUYXJnZXQge1xyXG4gIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgdGhpcy5saXN0ZW5lcnMgPSB7fTtcclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBUaWVzIGEgbGlzdGVuZXIgZnVuY3Rpb24gdG8gYW4gZXZlbnQgdHlwZSB3aGljaCBjYW4gbGF0ZXIgYmUgaW52b2tlZCB2aWEgdGhlXHJcbiAgKiBkaXNwYXRjaEV2ZW50IG1ldGhvZC5cclxuICAqXHJcbiAgKiBAcGFyYW0ge3N0cmluZ30gdHlwZSAtIHRoZSB0eXBlIG9mIGV2ZW50IChpZTogJ29wZW4nLCAnbWVzc2FnZScsIGV0Yy4pXHJcbiAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBsaXN0ZW5lciAtIHRoZSBjYWxsYmFjayBmdW5jdGlvbiB0byBpbnZva2Ugd2hlbmV2ZXIgYW4gZXZlbnQgaXMgZGlzcGF0Y2hlZCBtYXRjaGluZyB0aGUgZ2l2ZW4gdHlwZVxyXG4gICogQHBhcmFtIHtib29sZWFufSB1c2VDYXB0dXJlIC0gTi9BIFRPRE86IGltcGxlbWVudCB1c2VDYXB0dXJlIGZ1bmN0aW9uYWxpdHlcclxuICAqL1xyXG4gIGFkZEV2ZW50TGlzdGVuZXIodHlwZSwgbGlzdGVuZXIgLyogLCB1c2VDYXB0dXJlICovKSB7XHJcbiAgICBpZiAodHlwZW9mIGxpc3RlbmVyID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIGlmICghQXJyYXkuaXNBcnJheSh0aGlzLmxpc3RlbmVyc1t0eXBlXSkpIHtcclxuICAgICAgICB0aGlzLmxpc3RlbmVyc1t0eXBlXSA9IFtdO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBPbmx5IGFkZCB0aGUgc2FtZSBmdW5jdGlvbiBvbmNlXHJcbiAgICAgIGlmIChmaWx0ZXIodGhpcy5saXN0ZW5lcnNbdHlwZV0sIGl0ZW0gPT4gaXRlbSA9PT0gbGlzdGVuZXIpLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIHRoaXMubGlzdGVuZXJzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogUmVtb3ZlcyB0aGUgbGlzdGVuZXIgc28gaXQgd2lsbCBubyBsb25nZXIgYmUgaW52b2tlZCB2aWEgdGhlIGRpc3BhdGNoRXZlbnQgbWV0aG9kLlxyXG4gICpcclxuICAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gdGhlIHR5cGUgb2YgZXZlbnQgKGllOiAnb3BlbicsICdtZXNzYWdlJywgZXRjLilcclxuICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIC0gdGhlIGNhbGxiYWNrIGZ1bmN0aW9uIHRvIGludm9rZSB3aGVuZXZlciBhbiBldmVudCBpcyBkaXNwYXRjaGVkIG1hdGNoaW5nIHRoZSBnaXZlbiB0eXBlXHJcbiAgKiBAcGFyYW0ge2Jvb2xlYW59IHVzZUNhcHR1cmUgLSBOL0EgVE9ETzogaW1wbGVtZW50IHVzZUNhcHR1cmUgZnVuY3Rpb25hbGl0eVxyXG4gICovXHJcbiAgcmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlLCByZW1vdmluZ0xpc3RlbmVyIC8qICwgdXNlQ2FwdHVyZSAqLykge1xyXG4gICAgY29uc3QgYXJyYXlPZkxpc3RlbmVycyA9IHRoaXMubGlzdGVuZXJzW3R5cGVdO1xyXG4gICAgdGhpcy5saXN0ZW5lcnNbdHlwZV0gPSByZWplY3QoYXJyYXlPZkxpc3RlbmVycywgbGlzdGVuZXIgPT4gbGlzdGVuZXIgPT09IHJlbW92aW5nTGlzdGVuZXIpO1xyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIEludm9rZXMgYWxsIGxpc3RlbmVyIGZ1bmN0aW9ucyB0aGF0IGFyZSBsaXN0ZW5pbmcgdG8gdGhlIGdpdmVuIGV2ZW50LnR5cGUgcHJvcGVydHkuIEVhY2hcclxuICAqIGxpc3RlbmVyIHdpbGwgYmUgcGFzc2VkIHRoZSBldmVudCBhcyB0aGUgZmlyc3QgYXJndW1lbnQuXHJcbiAgKlxyXG4gICogQHBhcmFtIHtvYmplY3R9IGV2ZW50IC0gZXZlbnQgb2JqZWN0IHdoaWNoIHdpbGwgYmUgcGFzc2VkIHRvIGFsbCBsaXN0ZW5lcnMgb2YgdGhlIGV2ZW50LnR5cGUgcHJvcGVydHlcclxuICAqL1xyXG4gIGRpc3BhdGNoRXZlbnQoZXZlbnQsIC4uLmN1c3RvbUFyZ3VtZW50cykge1xyXG4gICAgY29uc3QgZXZlbnROYW1lID0gZXZlbnQudHlwZTtcclxuICAgIGNvbnN0IGxpc3RlbmVycyA9IHRoaXMubGlzdGVuZXJzW2V2ZW50TmFtZV07XHJcblxyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGxpc3RlbmVycykpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGxpc3RlbmVycy5mb3JFYWNoKGxpc3RlbmVyID0+IHtcclxuICAgICAgaWYgKGN1c3RvbUFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgbGlzdGVuZXIuYXBwbHkodGhpcywgY3VzdG9tQXJndW1lbnRzKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBsaXN0ZW5lci5jYWxsKHRoaXMsIGV2ZW50KTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBFdmVudFRhcmdldDtcclxuIiwiaW1wb3J0IHsgcmVqZWN0IH0gZnJvbSAnLi9oZWxwZXJzL2FycmF5LWhlbHBlcnMnO1xyXG5cclxuLypcclxuKiBUaGUgbmV0d29yayBicmlkZ2UgaXMgYSB3YXkgZm9yIHRoZSBtb2NrIHdlYnNvY2tldCBvYmplY3QgdG8gJ2NvbW11bmljYXRlJyB3aXRoXHJcbiogYWxsIGF2YWlsYWJsZSBzZXJ2ZXJzLiBUaGlzIGlzIGEgc2luZ2xldG9uIG9iamVjdCBzbyBpdCBpcyBpbXBvcnRhbnQgdGhhdCB5b3VcclxuKiBjbGVhbiB1cCB1cmxNYXAgd2hlbmV2ZXIgeW91IGFyZSBmaW5pc2hlZC5cclxuKi9cclxuY2xhc3MgTmV0d29ya0JyaWRnZSB7XHJcbiAgY29uc3RydWN0b3IoKSB7XHJcbiAgICB0aGlzLnVybE1hcCA9IHt9O1xyXG4gIH1cclxuXHJcbiAgZ2V0Q29ubmVjdGlvbkxvb2t1cCh1cmwpIHtcclxuICAgIGxldCBjb25uZWN0aW9uTG9va3VwID0gdGhpcy51cmxNYXBbdXJsXTtcclxuICAgIGlmICghIGNvbm5lY3Rpb25Mb29rdXApIHtcclxuICAgICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXModGhpcy51cmxNYXApO1xyXG4gICAgICAgIGxldCBpID0gMDtcclxuICAgICAgICB3aGlsZSAoISBjb25uZWN0aW9uTG9va3VwICYmIGkgPCBrZXlzLmxlbmd0aCkge1xyXG4gICAgICAgICAgaWYgKHVybC5zdGFydHNXaXRoKGtleXNbaV0pKSB7XHJcbiAgICAgICAgICAgIGNvbm5lY3Rpb25Mb29rdXAgPSB0aGlzLnVybE1hcFtrZXlzW2ldXTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGkrKztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gY29ubmVjdGlvbkxvb2t1cDtcclxuICB9XHJcbiAgLypcclxuICAqIEF0dGFjaGVzIGEgd2Vic29ja2V0IG9iamVjdCB0byB0aGUgdXJsTWFwIGhhc2ggc28gdGhhdCBpdCBjYW4gZmluZCB0aGUgc2VydmVyXHJcbiAgKiBpdCBpcyBjb25uZWN0ZWQgdG8gYW5kIHRoZSBzZXJ2ZXIgaW4gdHVybiBjYW4gZmluZCBpdC5cclxuICAqXHJcbiAgKiBAcGFyYW0ge29iamVjdH0gd2Vic29ja2V0IC0gd2Vic29ja2V0IG9iamVjdCB0byBhZGQgdG8gdGhlIHVybE1hcCBoYXNoXHJcbiAgKiBAcGFyYW0ge3N0cmluZ30gdXJsXHJcbiAgKi9cclxuICBhdHRhY2hXZWJTb2NrZXQod2Vic29ja2V0LCB1cmwpIHtcclxuICAgIGxldCBjb25uZWN0aW9uTG9va3VwID0gdGhpcy5nZXRDb25uZWN0aW9uTG9va3VwKHVybCk7XHJcbiAgICBpZiAoY29ubmVjdGlvbkxvb2t1cCAmJiBjb25uZWN0aW9uTG9va3VwLnNlcnZlciAmJiBjb25uZWN0aW9uTG9va3VwLndlYnNvY2tldHMuaW5kZXhPZih3ZWJzb2NrZXQpID09PSAtMSkge1xyXG4gICAgICBjb25uZWN0aW9uTG9va3VwLndlYnNvY2tldHMucHVzaCh3ZWJzb2NrZXQpO1xyXG4gICAgICByZXR1cm4gY29ubmVjdGlvbkxvb2t1cC5zZXJ2ZXI7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogQXR0YWNoZXMgYSB3ZWJzb2NrZXQgdG8gYSByb29tXHJcbiAgKi9cclxuICBhZGRNZW1iZXJzaGlwVG9Sb29tKHdlYnNvY2tldCwgcm9vbSkge1xyXG4gICAgY29uc3QgY29ubmVjdGlvbkxvb2t1cCA9IHRoaXMuZ2V0Q29ubmVjdGlvbkxvb2t1cCh3ZWJzb2NrZXQudXJsKTtcclxuXHJcbiAgICBpZiAoY29ubmVjdGlvbkxvb2t1cCAmJiBjb25uZWN0aW9uTG9va3VwLnNlcnZlciAmJiBjb25uZWN0aW9uTG9va3VwLndlYnNvY2tldHMuaW5kZXhPZih3ZWJzb2NrZXQpICE9PSAtMSkge1xyXG4gICAgICBpZiAoIWNvbm5lY3Rpb25Mb29rdXAucm9vbU1lbWJlcnNoaXBzW3Jvb21dKSB7XHJcbiAgICAgICAgY29ubmVjdGlvbkxvb2t1cC5yb29tTWVtYmVyc2hpcHNbcm9vbV0gPSBbXTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29ubmVjdGlvbkxvb2t1cC5yb29tTWVtYmVyc2hpcHNbcm9vbV0ucHVzaCh3ZWJzb2NrZXQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIEF0dGFjaGVzIGEgc2VydmVyIG9iamVjdCB0byB0aGUgdXJsTWFwIGhhc2ggc28gdGhhdCBpdCBjYW4gZmluZCBhIHdlYnNvY2tldHNcclxuICAqIHdoaWNoIGFyZSBjb25uZWN0ZWQgdG8gaXQgYW5kIHNvIHRoYXQgd2Vic29ja2V0cyBjYW4gaW4gdHVybiBjYW4gZmluZCBpdC5cclxuICAqXHJcbiAgKiBAcGFyYW0ge29iamVjdH0gc2VydmVyIC0gc2VydmVyIG9iamVjdCB0byBhZGQgdG8gdGhlIHVybE1hcCBoYXNoXHJcbiAgKiBAcGFyYW0ge3N0cmluZ30gdXJsXHJcbiAgKi9cclxuICBhdHRhY2hTZXJ2ZXIoc2VydmVyLCB1cmwpIHtcclxuICAgIGNvbnN0IGNvbm5lY3Rpb25Mb29rdXAgPSB0aGlzLmdldENvbm5lY3Rpb25Mb29rdXAodXJsKTtcclxuXHJcbiAgICBpZiAoIWNvbm5lY3Rpb25Mb29rdXApIHtcclxuICAgICAgdGhpcy51cmxNYXBbdXJsXSA9IHtcclxuICAgICAgICBzZXJ2ZXIsXHJcbiAgICAgICAgd2Vic29ja2V0czogW10sXHJcbiAgICAgICAgcm9vbU1lbWJlcnNoaXBzOiB7fVxyXG4gICAgICB9O1xyXG5cclxuICAgICAgcmV0dXJuIHNlcnZlcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBGaW5kcyB0aGUgc2VydmVyIHdoaWNoIGlzICdydW5uaW5nJyBvbiB0aGUgZ2l2ZW4gdXJsLlxyXG4gICpcclxuICAqIEBwYXJhbSB7c3RyaW5nfSB1cmwgLSB0aGUgdXJsIHRvIHVzZSB0byBmaW5kIHdoaWNoIHNlcnZlciBpcyBydW5uaW5nIG9uIGl0XHJcbiAgKi9cclxuICBzZXJ2ZXJMb29rdXAodXJsKSB7XHJcbiAgICBjb25zdCBjb25uZWN0aW9uTG9va3VwID0gdGhpcy5nZXRDb25uZWN0aW9uTG9va3VwKHVybCk7XHJcblxyXG4gICAgaWYgKGNvbm5lY3Rpb25Mb29rdXApIHtcclxuICAgICAgcmV0dXJuIGNvbm5lY3Rpb25Mb29rdXAuc2VydmVyO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIEZpbmRzIGFsbCB3ZWJzb2NrZXRzIHdoaWNoIGlzICdsaXN0ZW5pbmcnIG9uIHRoZSBnaXZlbiB1cmwuXHJcbiAgKlxyXG4gICogQHBhcmFtIHtzdHJpbmd9IHVybCAtIHRoZSB1cmwgdG8gdXNlIHRvIGZpbmQgYWxsIHdlYnNvY2tldHMgd2hpY2ggYXJlIGFzc29jaWF0ZWQgd2l0aCBpdFxyXG4gICogQHBhcmFtIHtzdHJpbmd9IHJvb20gLSBpZiBhIHJvb20gaXMgcHJvdmlkZWQsIHdpbGwgb25seSByZXR1cm4gc29ja2V0cyBpbiB0aGlzIHJvb21cclxuICAqIEBwYXJhbSB7Y2xhc3N9IGJyb2FkY2FzdGVyIC0gc29ja2V0IHRoYXQgaXMgYnJvYWRjYXN0aW5nIGFuZCBpcyB0byBiZSBleGNsdWRlZCBmcm9tIHRoZSBsb29rdXBcclxuICAqL1xyXG4gIHdlYnNvY2tldHNMb29rdXAodXJsLCByb29tLCBicm9hZGNhc3Rlcikge1xyXG4gICAgbGV0IHdlYnNvY2tldHM7XHJcbiAgICBjb25zdCBjb25uZWN0aW9uTG9va3VwID0gdGhpcy5nZXRDb25uZWN0aW9uTG9va3VwKHVybCk7XHJcblxyXG4gICAgd2Vic29ja2V0cyA9IGNvbm5lY3Rpb25Mb29rdXAgPyBjb25uZWN0aW9uTG9va3VwLndlYnNvY2tldHMgOiBbXTtcclxuXHJcbiAgICBpZiAocm9vbSkge1xyXG4gICAgICBjb25zdCBtZW1iZXJzID0gY29ubmVjdGlvbkxvb2t1cC5yb29tTWVtYmVyc2hpcHNbcm9vbV07XHJcbiAgICAgIHdlYnNvY2tldHMgPSBtZW1iZXJzIHx8IFtdO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBicm9hZGNhc3RlciA/IHdlYnNvY2tldHMuZmlsdGVyKHdlYnNvY2tldCA9PiB3ZWJzb2NrZXQgIT09IGJyb2FkY2FzdGVyKSA6IHdlYnNvY2tldHM7XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogUmVtb3ZlcyB0aGUgZW50cnkgYXNzb2NpYXRlZCB3aXRoIHRoZSB1cmwuXHJcbiAgKlxyXG4gICogQHBhcmFtIHtzdHJpbmd9IHVybFxyXG4gICovXHJcbiAgcmVtb3ZlU2VydmVyKHVybCkge1xyXG4gICAgZGVsZXRlIHRoaXMudXJsTWFwW3VybF07XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogUmVtb3ZlcyB0aGUgaW5kaXZpZHVhbCB3ZWJzb2NrZXQgZnJvbSB0aGUgbWFwIG9mIGFzc29jaWF0ZWQgd2Vic29ja2V0cy5cclxuICAqXHJcbiAgKiBAcGFyYW0ge29iamVjdH0gd2Vic29ja2V0IC0gd2Vic29ja2V0IG9iamVjdCB0byByZW1vdmUgZnJvbSB0aGUgdXJsIG1hcFxyXG4gICogQHBhcmFtIHtzdHJpbmd9IHVybFxyXG4gICovXHJcbiAgcmVtb3ZlV2ViU29ja2V0KHdlYnNvY2tldCwgdXJsKSB7XHJcbiAgICBjb25zdCBjb25uZWN0aW9uTG9va3VwID0gdGhpcy5nZXRDb25uZWN0aW9uTG9va3VwKHVybCk7XHJcblxyXG4gICAgaWYgKGNvbm5lY3Rpb25Mb29rdXApIHtcclxuICAgICAgY29ubmVjdGlvbkxvb2t1cC53ZWJzb2NrZXRzID0gcmVqZWN0KGNvbm5lY3Rpb25Mb29rdXAud2Vic29ja2V0cywgc29ja2V0ID0+IHNvY2tldCA9PT0gd2Vic29ja2V0KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBSZW1vdmVzIGEgd2Vic29ja2V0IGZyb20gYSByb29tXHJcbiAgKi9cclxuICByZW1vdmVNZW1iZXJzaGlwRnJvbVJvb20od2Vic29ja2V0LCByb29tKSB7XHJcbiAgICBjb25zdCBjb25uZWN0aW9uTG9va3VwID0gdGhpcy5nZXRDb25uZWN0aW9uTG9va3VwKHdlYnNvY2tldC51cmwpO1xyXG4gICAgY29uc3QgbWVtYmVyc2hpcHMgPSBjb25uZWN0aW9uTG9va3VwLnJvb21NZW1iZXJzaGlwc1tyb29tXTtcclxuXHJcbiAgICBpZiAoY29ubmVjdGlvbkxvb2t1cCAmJiBtZW1iZXJzaGlwcyAhPT0gbnVsbCkge1xyXG4gICAgICBjb25uZWN0aW9uTG9va3VwLnJvb21NZW1iZXJzaGlwc1tyb29tXSA9IHJlamVjdChtZW1iZXJzaGlwcywgc29ja2V0ID0+IHNvY2tldCA9PT0gd2Vic29ja2V0KTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IG5ldyBOZXR3b3JrQnJpZGdlKCk7IC8vIE5vdGU6IHRoaXMgaXMgYSBzaW5nbGV0b25cclxuIiwiLypcclxuKiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvQ2xvc2VFdmVudFxyXG4qL1xyXG5jb25zdCBjb2RlcyA9IHtcclxuICBDTE9TRV9OT1JNQUw6IDEwMDAsXHJcbiAgQ0xPU0VfR09JTkdfQVdBWTogMTAwMSxcclxuICBDTE9TRV9QUk9UT0NPTF9FUlJPUjogMTAwMixcclxuICBDTE9TRV9VTlNVUFBPUlRFRDogMTAwMyxcclxuICBDTE9TRV9OT19TVEFUVVM6IDEwMDUsXHJcbiAgQ0xPU0VfQUJOT1JNQUw6IDEwMDYsXHJcbiAgQ0xPU0VfVE9PX0xBUkdFOiAxMDA5XHJcbn07XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjb2RlcztcclxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gbm9ybWFsaXplVXJsKHVybCkge1xyXG4gIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCc6Ly8nKTtcclxuICByZXR1cm4gcGFydHNbMV0gJiYgcGFydHNbMV0uaW5kZXhPZignLycpID09PSAtMSA/IGAke3VybH0vYCA6IHVybDtcclxufVxyXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBsb2cobWV0aG9kLCBtZXNzYWdlKSB7XHJcbiAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xyXG4gIGlmICh0eXBlb2YgcHJvY2VzcyAhPT0gJ3VuZGVmaW5lZCcgJiYgcHJvY2Vzcy5lbnYuTk9ERV9FTlYgIT09ICd0ZXN0Jykge1xyXG4gICAgY29uc29sZVttZXRob2RdLmNhbGwobnVsbCwgbWVzc2FnZSk7XHJcbiAgfVxyXG4gIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xyXG59XHJcbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIEV2ZW50UHJvdG90eXBlIHtcclxuICAvLyBOb29wc1xyXG4gIHN0b3BQcm9wYWdhdGlvbigpIHt9XHJcbiAgc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCkge31cclxuXHJcbiAgLy8gaWYgbm8gYXJndW1lbnRzIGFyZSBwYXNzZWQgdGhlbiB0aGUgdHlwZSBpcyBzZXQgdG8gXCJ1bmRlZmluZWRcIiBvblxyXG4gIC8vIGNocm9tZSBhbmQgc2FmYXJpLlxyXG4gIGluaXRFdmVudCh0eXBlID0gJ3VuZGVmaW5lZCcsIGJ1YmJsZXMgPSBmYWxzZSwgY2FuY2VsYWJsZSA9IGZhbHNlKSB7XHJcbiAgICB0aGlzLnR5cGUgPSBTdHJpbmcodHlwZSk7XHJcbiAgICB0aGlzLmJ1YmJsZXMgPSBCb29sZWFuKGJ1YmJsZXMpO1xyXG4gICAgdGhpcy5jYW5jZWxhYmxlID0gQm9vbGVhbihjYW5jZWxhYmxlKTtcclxuICB9XHJcbn1cclxuIiwiaW1wb3J0IEV2ZW50UHJvdG90eXBlIGZyb20gJy4vZXZlbnQtcHJvdG90eXBlJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEV2ZW50IGV4dGVuZHMgRXZlbnRQcm90b3R5cGUge1xyXG4gIGNvbnN0cnVjdG9yKHR5cGUsIGV2ZW50SW5pdENvbmZpZyA9IHt9KSB7XHJcbiAgICBzdXBlcigpO1xyXG5cclxuICAgIGlmICghdHlwZSkge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRmFpbGVkIHRvIGNvbnN0cnVjdCAnRXZlbnQnOiAxIGFyZ3VtZW50IHJlcXVpcmVkLCBidXQgb25seSAwIHByZXNlbnQuXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2YgZXZlbnRJbml0Q29uZmlnICE9PSAnb2JqZWN0Jykge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRmFpbGVkIHRvIGNvbnN0cnVjdCAnRXZlbnQnOiBwYXJhbWV0ZXIgMiAoJ2V2ZW50SW5pdERpY3QnKSBpcyBub3QgYW4gb2JqZWN0XCIpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHsgYnViYmxlcywgY2FuY2VsYWJsZSB9ID0gZXZlbnRJbml0Q29uZmlnO1xyXG5cclxuICAgIHRoaXMudHlwZSA9IFN0cmluZyh0eXBlKTtcclxuICAgIHRoaXMudGltZVN0YW1wID0gRGF0ZS5ub3coKTtcclxuICAgIHRoaXMudGFyZ2V0ID0gbnVsbDtcclxuICAgIHRoaXMuc3JjRWxlbWVudCA9IG51bGw7XHJcbiAgICB0aGlzLnJldHVyblZhbHVlID0gdHJ1ZTtcclxuICAgIHRoaXMuaXNUcnVzdGVkID0gZmFsc2U7XHJcbiAgICB0aGlzLmV2ZW50UGhhc2UgPSAwO1xyXG4gICAgdGhpcy5kZWZhdWx0UHJldmVudGVkID0gZmFsc2U7XHJcbiAgICB0aGlzLmN1cnJlbnRUYXJnZXQgPSBudWxsO1xyXG4gICAgdGhpcy5jYW5jZWxhYmxlID0gY2FuY2VsYWJsZSA/IEJvb2xlYW4oY2FuY2VsYWJsZSkgOiBmYWxzZTtcclxuICAgIHRoaXMuY2FubmNlbEJ1YmJsZSA9IGZhbHNlO1xyXG4gICAgdGhpcy5idWJibGVzID0gYnViYmxlcyA/IEJvb2xlYW4oYnViYmxlcykgOiBmYWxzZTtcclxuICB9XHJcbn1cclxuIiwiaW1wb3J0IEV2ZW50UHJvdG90eXBlIGZyb20gJy4vZXZlbnQtcHJvdG90eXBlJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1lc3NhZ2VFdmVudCBleHRlbmRzIEV2ZW50UHJvdG90eXBlIHtcclxuICBjb25zdHJ1Y3Rvcih0eXBlLCBldmVudEluaXRDb25maWcgPSB7fSkge1xyXG4gICAgc3VwZXIoKTtcclxuXHJcbiAgICBpZiAoIXR5cGUpIHtcclxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZhaWxlZCB0byBjb25zdHJ1Y3QgJ01lc3NhZ2VFdmVudCc6IDEgYXJndW1lbnQgcmVxdWlyZWQsIGJ1dCBvbmx5IDAgcHJlc2VudC5cIik7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiBldmVudEluaXRDb25maWcgIT09ICdvYmplY3QnKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJGYWlsZWQgdG8gY29uc3RydWN0ICdNZXNzYWdlRXZlbnQnOiBwYXJhbWV0ZXIgMiAoJ2V2ZW50SW5pdERpY3QnKSBpcyBub3QgYW4gb2JqZWN0XCIpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHsgYnViYmxlcywgY2FuY2VsYWJsZSwgZGF0YSwgb3JpZ2luLCBsYXN0RXZlbnRJZCwgcG9ydHMgfSA9IGV2ZW50SW5pdENvbmZpZztcclxuXHJcbiAgICB0aGlzLnR5cGUgPSBTdHJpbmcodHlwZSk7XHJcbiAgICB0aGlzLnRpbWVTdGFtcCA9IERhdGUubm93KCk7XHJcbiAgICB0aGlzLnRhcmdldCA9IG51bGw7XHJcbiAgICB0aGlzLnNyY0VsZW1lbnQgPSBudWxsO1xyXG4gICAgdGhpcy5yZXR1cm5WYWx1ZSA9IHRydWU7XHJcbiAgICB0aGlzLmlzVHJ1c3RlZCA9IGZhbHNlO1xyXG4gICAgdGhpcy5ldmVudFBoYXNlID0gMDtcclxuICAgIHRoaXMuZGVmYXVsdFByZXZlbnRlZCA9IGZhbHNlO1xyXG4gICAgdGhpcy5jdXJyZW50VGFyZ2V0ID0gbnVsbDtcclxuICAgIHRoaXMuY2FuY2VsYWJsZSA9IGNhbmNlbGFibGUgPyBCb29sZWFuKGNhbmNlbGFibGUpIDogZmFsc2U7XHJcbiAgICB0aGlzLmNhbm5jZWxCdWJibGUgPSBmYWxzZTtcclxuICAgIHRoaXMuYnViYmxlcyA9IGJ1YmJsZXMgPyBCb29sZWFuKGJ1YmJsZXMpIDogZmFsc2U7XHJcbiAgICB0aGlzLm9yaWdpbiA9IG9yaWdpbiA/IFN0cmluZyhvcmlnaW4pIDogJyc7XHJcbiAgICB0aGlzLnBvcnRzID0gdHlwZW9mIHBvcnRzID09PSAndW5kZWZpbmVkJyA/IG51bGwgOiBwb3J0cztcclxuICAgIHRoaXMuZGF0YSA9IHR5cGVvZiBkYXRhID09PSAndW5kZWZpbmVkJyA/IG51bGwgOiBkYXRhO1xyXG4gICAgdGhpcy5sYXN0RXZlbnRJZCA9IGxhc3RFdmVudElkID8gU3RyaW5nKGxhc3RFdmVudElkKSA6ICcnO1xyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQgRXZlbnRQcm90b3R5cGUgZnJvbSAnLi9ldmVudC1wcm90b3R5cGUnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQ2xvc2VFdmVudCBleHRlbmRzIEV2ZW50UHJvdG90eXBlIHtcclxuICBjb25zdHJ1Y3Rvcih0eXBlLCBldmVudEluaXRDb25maWcgPSB7fSkge1xyXG4gICAgc3VwZXIoKTtcclxuXHJcbiAgICBpZiAoIXR5cGUpIHtcclxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZhaWxlZCB0byBjb25zdHJ1Y3QgJ0Nsb3NlRXZlbnQnOiAxIGFyZ3VtZW50IHJlcXVpcmVkLCBidXQgb25seSAwIHByZXNlbnQuXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2YgZXZlbnRJbml0Q29uZmlnICE9PSAnb2JqZWN0Jykge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRmFpbGVkIHRvIGNvbnN0cnVjdCAnQ2xvc2VFdmVudCc6IHBhcmFtZXRlciAyICgnZXZlbnRJbml0RGljdCcpIGlzIG5vdCBhbiBvYmplY3RcIik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgeyBidWJibGVzLCBjYW5jZWxhYmxlLCBjb2RlLCByZWFzb24sIHdhc0NsZWFuIH0gPSBldmVudEluaXRDb25maWc7XHJcblxyXG4gICAgdGhpcy50eXBlID0gU3RyaW5nKHR5cGUpO1xyXG4gICAgdGhpcy50aW1lU3RhbXAgPSBEYXRlLm5vdygpO1xyXG4gICAgdGhpcy50YXJnZXQgPSBudWxsO1xyXG4gICAgdGhpcy5zcmNFbGVtZW50ID0gbnVsbDtcclxuICAgIHRoaXMucmV0dXJuVmFsdWUgPSB0cnVlO1xyXG4gICAgdGhpcy5pc1RydXN0ZWQgPSBmYWxzZTtcclxuICAgIHRoaXMuZXZlbnRQaGFzZSA9IDA7XHJcbiAgICB0aGlzLmRlZmF1bHRQcmV2ZW50ZWQgPSBmYWxzZTtcclxuICAgIHRoaXMuY3VycmVudFRhcmdldCA9IG51bGw7XHJcbiAgICB0aGlzLmNhbmNlbGFibGUgPSBjYW5jZWxhYmxlID8gQm9vbGVhbihjYW5jZWxhYmxlKSA6IGZhbHNlO1xyXG4gICAgdGhpcy5jYW5uY2VsQnViYmxlID0gZmFsc2U7XHJcbiAgICB0aGlzLmJ1YmJsZXMgPSBidWJibGVzID8gQm9vbGVhbihidWJibGVzKSA6IGZhbHNlO1xyXG4gICAgdGhpcy5jb2RlID0gdHlwZW9mIGNvZGUgPT09ICdudW1iZXInID8gTnVtYmVyKGNvZGUpIDogMDtcclxuICAgIHRoaXMucmVhc29uID0gcmVhc29uID8gU3RyaW5nKHJlYXNvbikgOiAnJztcclxuICAgIHRoaXMud2FzQ2xlYW4gPSB3YXNDbGVhbiA/IEJvb2xlYW4od2FzQ2xlYW4pIDogZmFsc2U7XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCBFdmVudCBmcm9tICcuL2hlbHBlcnMvZXZlbnQnO1xyXG5pbXBvcnQgTWVzc2FnZUV2ZW50IGZyb20gJy4vaGVscGVycy9tZXNzYWdlLWV2ZW50JztcclxuaW1wb3J0IENsb3NlRXZlbnQgZnJvbSAnLi9oZWxwZXJzL2Nsb3NlLWV2ZW50JztcclxuXHJcbi8qXHJcbiogQ3JlYXRlcyBhbiBFdmVudCBvYmplY3QgYW5kIGV4dGVuZHMgaXQgdG8gYWxsb3cgZnVsbCBtb2RpZmljYXRpb24gb2ZcclxuKiBpdHMgcHJvcGVydGllcy5cclxuKlxyXG4qIEBwYXJhbSB7b2JqZWN0fSBjb25maWcgLSB3aXRoaW4gY29uZmlnIHlvdSB3aWxsIG5lZWQgdG8gcGFzcyB0eXBlIGFuZCBvcHRpb25hbGx5IHRhcmdldFxyXG4qL1xyXG5mdW5jdGlvbiBjcmVhdGVFdmVudChjb25maWcpIHtcclxuICBjb25zdCB7IHR5cGUsIHRhcmdldCB9ID0gY29uZmlnO1xyXG4gIGNvbnN0IGV2ZW50T2JqZWN0ID0gbmV3IEV2ZW50KHR5cGUpO1xyXG5cclxuICBpZiAodGFyZ2V0KSB7XHJcbiAgICBldmVudE9iamVjdC50YXJnZXQgPSB0YXJnZXQ7XHJcbiAgICBldmVudE9iamVjdC5zcmNFbGVtZW50ID0gdGFyZ2V0O1xyXG4gICAgZXZlbnRPYmplY3QuY3VycmVudFRhcmdldCA9IHRhcmdldDtcclxuICB9XHJcblxyXG4gIHJldHVybiBldmVudE9iamVjdDtcclxufVxyXG5cclxuLypcclxuKiBDcmVhdGVzIGEgTWVzc2FnZUV2ZW50IG9iamVjdCBhbmQgZXh0ZW5kcyBpdCB0byBhbGxvdyBmdWxsIG1vZGlmaWNhdGlvbiBvZlxyXG4qIGl0cyBwcm9wZXJ0aWVzLlxyXG4qXHJcbiogQHBhcmFtIHtvYmplY3R9IGNvbmZpZyAtIHdpdGhpbiBjb25maWc6IHR5cGUsIG9yaWdpbiwgZGF0YSBhbmQgb3B0aW9uYWxseSB0YXJnZXRcclxuKi9cclxuZnVuY3Rpb24gY3JlYXRlTWVzc2FnZUV2ZW50KGNvbmZpZykge1xyXG4gIGNvbnN0IHsgdHlwZSwgb3JpZ2luLCBkYXRhLCB0YXJnZXQgfSA9IGNvbmZpZztcclxuICBjb25zdCBtZXNzYWdlRXZlbnQgPSBuZXcgTWVzc2FnZUV2ZW50KHR5cGUsIHtcclxuICAgIGRhdGEsXHJcbiAgICBvcmlnaW5cclxuICB9KTtcclxuXHJcbiAgaWYgKHRhcmdldCkge1xyXG4gICAgbWVzc2FnZUV2ZW50LnRhcmdldCA9IHRhcmdldDtcclxuICAgIG1lc3NhZ2VFdmVudC5zcmNFbGVtZW50ID0gdGFyZ2V0O1xyXG4gICAgbWVzc2FnZUV2ZW50LmN1cnJlbnRUYXJnZXQgPSB0YXJnZXQ7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gbWVzc2FnZUV2ZW50O1xyXG59XHJcblxyXG4vKlxyXG4qIENyZWF0ZXMgYSBDbG9zZUV2ZW50IG9iamVjdCBhbmQgZXh0ZW5kcyBpdCB0byBhbGxvdyBmdWxsIG1vZGlmaWNhdGlvbiBvZlxyXG4qIGl0cyBwcm9wZXJ0aWVzLlxyXG4qXHJcbiogQHBhcmFtIHtvYmplY3R9IGNvbmZpZyAtIHdpdGhpbiBjb25maWc6IHR5cGUgYW5kIG9wdGlvbmFsbHkgdGFyZ2V0LCBjb2RlLCBhbmQgcmVhc29uXHJcbiovXHJcbmZ1bmN0aW9uIGNyZWF0ZUNsb3NlRXZlbnQoY29uZmlnKSB7XHJcbiAgY29uc3QgeyBjb2RlLCByZWFzb24sIHR5cGUsIHRhcmdldCB9ID0gY29uZmlnO1xyXG4gIGxldCB7IHdhc0NsZWFuIH0gPSBjb25maWc7XHJcblxyXG4gIGlmICghd2FzQ2xlYW4pIHtcclxuICAgIHdhc0NsZWFuID0gY29kZSA9PT0gMTAwMDtcclxuICB9XHJcblxyXG4gIGNvbnN0IGNsb3NlRXZlbnQgPSBuZXcgQ2xvc2VFdmVudCh0eXBlLCB7XHJcbiAgICBjb2RlLFxyXG4gICAgcmVhc29uLFxyXG4gICAgd2FzQ2xlYW5cclxuICB9KTtcclxuXHJcbiAgaWYgKHRhcmdldCkge1xyXG4gICAgY2xvc2VFdmVudC50YXJnZXQgPSB0YXJnZXQ7XHJcbiAgICBjbG9zZUV2ZW50LnNyY0VsZW1lbnQgPSB0YXJnZXQ7XHJcbiAgICBjbG9zZUV2ZW50LmN1cnJlbnRUYXJnZXQgPSB0YXJnZXQ7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gY2xvc2VFdmVudDtcclxufVxyXG5cclxuZXhwb3J0IHsgY3JlYXRlRXZlbnQsIGNyZWF0ZU1lc3NhZ2VFdmVudCwgY3JlYXRlQ2xvc2VFdmVudCB9O1xyXG4iLCJpbXBvcnQgZGVsYXkgZnJvbSAnLi9oZWxwZXJzL2RlbGF5JztcclxuaW1wb3J0IEV2ZW50VGFyZ2V0IGZyb20gJy4vZXZlbnQtdGFyZ2V0JztcclxuaW1wb3J0IG5ldHdvcmtCcmlkZ2UgZnJvbSAnLi9uZXR3b3JrLWJyaWRnZSc7XHJcbmltcG9ydCBDTE9TRV9DT0RFUyBmcm9tICcuL2hlbHBlcnMvY2xvc2UtY29kZXMnO1xyXG5pbXBvcnQgbm9ybWFsaXplIGZyb20gJy4vaGVscGVycy9ub3JtYWxpemUtdXJsJztcclxuaW1wb3J0IGxvZ2dlciBmcm9tICcuL2hlbHBlcnMvbG9nZ2VyJztcclxuaW1wb3J0IHsgY3JlYXRlRXZlbnQsIGNyZWF0ZU1lc3NhZ2VFdmVudCwgY3JlYXRlQ2xvc2VFdmVudCB9IGZyb20gJy4vZXZlbnQtZmFjdG9yeSc7XHJcblxyXG4vKlxyXG4qIFRoZSBtYWluIHdlYnNvY2tldCBjbGFzcyB3aGljaCBpcyBkZXNpZ25lZCB0byBtaW1pY2sgdGhlIG5hdGl2ZSBXZWJTb2NrZXQgY2xhc3MgYXMgY2xvc2VcclxuKiBhcyBwb3NzaWJsZS5cclxuKlxyXG4qIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9XZWJTb2NrZXRcclxuKi9cclxuY2xhc3MgV2ViU29ja2V0IGV4dGVuZHMgRXZlbnRUYXJnZXQge1xyXG4gIC8qXHJcbiAgKiBAcGFyYW0ge3N0cmluZ30gdXJsXHJcbiAgKi9cclxuICBjb25zdHJ1Y3Rvcih1cmwsIHByb3RvY29sID0gJycpIHtcclxuICAgIHN1cGVyKCk7XHJcblxyXG4gICAgaWYgKCF1cmwpIHtcclxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZhaWxlZCB0byBjb25zdHJ1Y3QgJ1dlYlNvY2tldCc6IDEgYXJndW1lbnQgcmVxdWlyZWQsIGJ1dCBvbmx5IDAgcHJlc2VudC5cIik7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5iaW5hcnlUeXBlID0gJ2Jsb2InO1xyXG4gICAgdGhpcy51cmwgPSBub3JtYWxpemUodXJsKTtcclxuICAgIHRoaXMucmVhZHlTdGF0ZSA9IFdlYlNvY2tldC5DT05ORUNUSU5HO1xyXG4gICAgdGhpcy5wcm90b2NvbCA9ICcnO1xyXG5cclxuICAgIGlmICh0eXBlb2YgcHJvdG9jb2wgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgIHRoaXMucHJvdG9jb2wgPSBwcm90b2NvbDtcclxuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShwcm90b2NvbCkgJiYgcHJvdG9jb2wubGVuZ3RoID4gMCkge1xyXG4gICAgICB0aGlzLnByb3RvY29sID0gcHJvdG9jb2xbMF07XHJcbiAgICB9XHJcblxyXG4gICAgLypcclxuICAgICogSW4gb3JkZXIgdG8gY2FwdHVyZSB0aGUgY2FsbGJhY2sgZnVuY3Rpb24gd2UgbmVlZCB0byBkZWZpbmUgY3VzdG9tIHNldHRlcnMuXHJcbiAgICAqIFRvIGlsbHVzdHJhdGU6XHJcbiAgICAqICAgbXlTb2NrZXQub25vcGVuID0gZnVuY3Rpb24oKSB7IGFsZXJ0KHRydWUpIH07XHJcbiAgICAqXHJcbiAgICAqIFRoZSBvbmx5IHdheSB0byBjYXB0dXJlIHRoYXQgZnVuY3Rpb24gYW5kIGhvbGQgb250byBpdCBmb3IgbGF0ZXIgaXMgd2l0aCB0aGVcclxuICAgICogYmVsb3cgY29kZTpcclxuICAgICovXHJcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyh0aGlzLCB7XHJcbiAgICAgIG9ub3Blbjoge1xyXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcclxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxyXG4gICAgICAgIGdldCgpIHtcclxuICAgICAgICAgIHJldHVybiB0aGlzLmxpc3RlbmVycy5vcGVuO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgc2V0KGxpc3RlbmVyKSB7XHJcbiAgICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ29wZW4nLCBsaXN0ZW5lcik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICBvbm1lc3NhZ2U6IHtcclxuICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXHJcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcclxuICAgICAgICBnZXQoKSB7XHJcbiAgICAgICAgICByZXR1cm4gdGhpcy5saXN0ZW5lcnMubWVzc2FnZTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIHNldChsaXN0ZW5lcikge1xyXG4gICAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgbGlzdGVuZXIpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgICAgb25jbG9zZToge1xyXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcclxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxyXG4gICAgICAgIGdldCgpIHtcclxuICAgICAgICAgIHJldHVybiB0aGlzLmxpc3RlbmVycy5jbG9zZTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIHNldChsaXN0ZW5lcikge1xyXG4gICAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCdjbG9zZScsIGxpc3RlbmVyKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcbiAgICAgIG9uZXJyb3I6IHtcclxuICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXHJcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcclxuICAgICAgICBnZXQoKSB7XHJcbiAgICAgICAgICByZXR1cm4gdGhpcy5saXN0ZW5lcnMuZXJyb3I7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBzZXQobGlzdGVuZXIpIHtcclxuICAgICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCBsaXN0ZW5lcik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcblxyXG4gICAgY29uc3Qgc2VydmVyID0gbmV0d29ya0JyaWRnZS5hdHRhY2hXZWJTb2NrZXQodGhpcywgdGhpcy51cmwpO1xyXG5cclxuICAgIC8qXHJcbiAgICAqIFRoaXMgZGVsYXkgaXMgbmVlZGVkIHNvIHRoYXQgd2UgZG9udCB0cmlnZ2VyIGFuIGV2ZW50IGJlZm9yZSB0aGUgY2FsbGJhY2tzIGhhdmUgYmVlblxyXG4gICAgKiBzZXR1cC4gRm9yIGV4YW1wbGU6XHJcbiAgICAqXHJcbiAgICAqIHZhciBzb2NrZXQgPSBuZXcgV2ViU29ja2V0KCd3czovL2xvY2FsaG9zdCcpO1xyXG4gICAgKlxyXG4gICAgKiAvLyBJZiB3ZSBkb250IGhhdmUgdGhlIGRlbGF5IHRoZW4gdGhlIGV2ZW50IHdvdWxkIGJlIHRyaWdnZXJlZCByaWdodCBoZXJlIGFuZCB0aGlzIGlzXHJcbiAgICAqIC8vIGJlZm9yZSB0aGUgb25vcGVuIGhhZCBhIGNoYW5jZSB0byByZWdpc3RlciBpdHNlbGYuXHJcbiAgICAqXHJcbiAgICAqIHNvY2tldC5vbm9wZW4gPSAoKSA9PiB7IC8vIHRoaXMgd291bGQgbmV2ZXIgYmUgY2FsbGVkIH07XHJcbiAgICAqXHJcbiAgICAqIC8vIGFuZCB3aXRoIHRoZSBkZWxheSB0aGUgZXZlbnQgZ2V0cyB0cmlnZ2VyZWQgaGVyZSBhZnRlciBhbGwgb2YgdGhlIGNhbGxiYWNrcyBoYXZlIGJlZW5cclxuICAgICogLy8gcmVnaXN0ZXJlZCA6LSlcclxuICAgICovXHJcbiAgICBkZWxheShmdW5jdGlvbiBkZWxheUNhbGxiYWNrKCkge1xyXG4gICAgICBpZiAoc2VydmVyKSB7XHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgc2VydmVyLm9wdGlvbnMudmVyaWZ5Q2xpZW50ICYmXHJcbiAgICAgICAgICB0eXBlb2Ygc2VydmVyLm9wdGlvbnMudmVyaWZ5Q2xpZW50ID09PSAnZnVuY3Rpb24nICYmXHJcbiAgICAgICAgICAhc2VydmVyLm9wdGlvbnMudmVyaWZ5Q2xpZW50KClcclxuICAgICAgICApIHtcclxuICAgICAgICAgIHRoaXMucmVhZHlTdGF0ZSA9IFdlYlNvY2tldC5DTE9TRUQ7XHJcblxyXG4gICAgICAgICAgbG9nZ2VyKFxyXG4gICAgICAgICAgICAnZXJyb3InLFxyXG4gICAgICAgICAgICBgV2ViU29ja2V0IGNvbm5lY3Rpb24gdG8gJyR7dGhpcy51cmx9JyBmYWlsZWQ6IEhUVFAgQXV0aGVudGljYXRpb24gZmFpbGVkOyBubyB2YWxpZCBjcmVkZW50aWFscyBhdmFpbGFibGVgXHJcbiAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgIG5ldHdvcmtCcmlkZ2UucmVtb3ZlV2ViU29ja2V0KHRoaXMsIHRoaXMudXJsKTtcclxuICAgICAgICAgIHRoaXMuZGlzcGF0Y2hFdmVudChjcmVhdGVFdmVudCh7IHR5cGU6ICdlcnJvcicsIHRhcmdldDogdGhpcyB9KSk7XHJcbiAgICAgICAgICB0aGlzLmRpc3BhdGNoRXZlbnQoY3JlYXRlQ2xvc2VFdmVudCh7IHR5cGU6ICdjbG9zZScsIHRhcmdldDogdGhpcywgY29kZTogQ0xPU0VfQ09ERVMuQ0xPU0VfTk9STUFMIH0pKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgdGhpcy5yZWFkeVN0YXRlID0gV2ViU29ja2V0Lk9QRU47XHJcbiAgICAgICAgICB0aGlzLmRpc3BhdGNoRXZlbnQoY3JlYXRlRXZlbnQoeyB0eXBlOiAnb3BlbicsIHRhcmdldDogdGhpcyB9KSk7XHJcbiAgICAgICAgICBzZXJ2ZXIuZGlzcGF0Y2hFdmVudChjcmVhdGVFdmVudCh7IHR5cGU6ICdjb25uZWN0aW9uJyB9KSwgc2VydmVyLCB0aGlzKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5yZWFkeVN0YXRlID0gV2ViU29ja2V0LkNMT1NFRDtcclxuICAgICAgICB0aGlzLmRpc3BhdGNoRXZlbnQoY3JlYXRlRXZlbnQoeyB0eXBlOiAnZXJyb3InLCB0YXJnZXQ6IHRoaXMgfSkpO1xyXG4gICAgICAgIHRoaXMuZGlzcGF0Y2hFdmVudChjcmVhdGVDbG9zZUV2ZW50KHsgdHlwZTogJ2Nsb3NlJywgdGFyZ2V0OiB0aGlzLCBjb2RlOiBDTE9TRV9DT0RFUy5DTE9TRV9OT1JNQUwgfSkpO1xyXG5cclxuICAgICAgICBsb2dnZXIoJ2Vycm9yJywgYFdlYlNvY2tldCBjb25uZWN0aW9uIHRvICcke3RoaXMudXJsfScgZmFpbGVkYCk7XHJcbiAgICAgIH1cclxuICAgIH0sIHRoaXMpO1xyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIFRyYW5zbWl0cyBkYXRhIHRvIHRoZSBzZXJ2ZXIgb3ZlciB0aGUgV2ViU29ja2V0IGNvbm5lY3Rpb24uXHJcbiAgKlxyXG4gICogaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL1dlYlNvY2tldCNzZW5kKClcclxuICAqL1xyXG4gIHNlbmQoZGF0YSkge1xyXG4gICAgaWYgKHRoaXMucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0LkNMT1NJTkcgfHwgdGhpcy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuQ0xPU0VEKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignV2ViU29ja2V0IGlzIGFscmVhZHkgaW4gQ0xPU0lORyBvciBDTE9TRUQgc3RhdGUnKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBtZXNzYWdlRXZlbnQgPSBjcmVhdGVNZXNzYWdlRXZlbnQoe1xyXG4gICAgICB0eXBlOiAnbWVzc2FnZScsXHJcbiAgICAgIG9yaWdpbjogdGhpcy51cmwsXHJcbiAgICAgIGRhdGFcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHNlcnZlciA9IG5ldHdvcmtCcmlkZ2Uuc2VydmVyTG9va3VwKHRoaXMudXJsKTtcclxuXHJcbiAgICBpZiAoc2VydmVyKSB7XHJcbiAgICAgIGRlbGF5KCgpID0+IHtcclxuICAgICAgICBzZXJ2ZXIuZGlzcGF0Y2hFdmVudChtZXNzYWdlRXZlbnQsIGRhdGEpO1xyXG4gICAgICB9LCBzZXJ2ZXIpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIENsb3NlcyB0aGUgV2ViU29ja2V0IGNvbm5lY3Rpb24gb3IgY29ubmVjdGlvbiBhdHRlbXB0LCBpZiBhbnkuXHJcbiAgKiBJZiB0aGUgY29ubmVjdGlvbiBpcyBhbHJlYWR5IENMT1NFRCwgdGhpcyBtZXRob2QgZG9lcyBub3RoaW5nLlxyXG4gICpcclxuICAqIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9XZWJTb2NrZXQjY2xvc2UoKVxyXG4gICovXHJcbiAgY2xvc2UoKSB7XHJcbiAgICBpZiAodGhpcy5yZWFkeVN0YXRlICE9PSBXZWJTb2NrZXQuT1BFTikge1xyXG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHNlcnZlciA9IG5ldHdvcmtCcmlkZ2Uuc2VydmVyTG9va3VwKHRoaXMudXJsKTtcclxuICAgIGNvbnN0IGNsb3NlRXZlbnQgPSBjcmVhdGVDbG9zZUV2ZW50KHtcclxuICAgICAgdHlwZTogJ2Nsb3NlJyxcclxuICAgICAgdGFyZ2V0OiB0aGlzLFxyXG4gICAgICBjb2RlOiBDTE9TRV9DT0RFUy5DTE9TRV9OT1JNQUxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldHdvcmtCcmlkZ2UucmVtb3ZlV2ViU29ja2V0KHRoaXMsIHRoaXMudXJsKTtcclxuXHJcbiAgICB0aGlzLnJlYWR5U3RhdGUgPSBXZWJTb2NrZXQuQ0xPU0VEO1xyXG4gICAgdGhpcy5kaXNwYXRjaEV2ZW50KGNsb3NlRXZlbnQpO1xyXG5cclxuICAgIGlmIChzZXJ2ZXIpIHtcclxuICAgICAgc2VydmVyLmRpc3BhdGNoRXZlbnQoY2xvc2VFdmVudCwgc2VydmVyKTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbldlYlNvY2tldC5DT05ORUNUSU5HID0gMDtcclxuV2ViU29ja2V0Lk9QRU4gPSAxO1xyXG5XZWJTb2NrZXQuQ0xPU0lORyA9IDI7XHJcbldlYlNvY2tldC5DTE9TRUQgPSAzO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgV2ViU29ja2V0O1xyXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiByZXRyaWV2ZUdsb2JhbE9iamVjdCgpIHtcclxuICBpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgIHJldHVybiB3aW5kb3c7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gdHlwZW9mIHByb2Nlc3MgPT09ICdvYmplY3QnICYmIHR5cGVvZiByZXF1aXJlID09PSAnZnVuY3Rpb24nICYmIHR5cGVvZiBnbG9iYWwgPT09ICdvYmplY3QnID8gZ2xvYmFsIDogdGhpcztcclxufVxyXG4iLCJleHBvcnQgZGVmYXVsdCBhcnIgPT5cclxuICBhcnIucmVkdWNlKChkZWR1cGVkLCBiKSA9PiB7XHJcbiAgICBpZiAoZGVkdXBlZC5pbmRleE9mKGIpID4gLTEpIHJldHVybiBkZWR1cGVkO1xyXG4gICAgcmV0dXJuIGRlZHVwZWQuY29uY2F0KGIpO1xyXG4gIH0sIFtdKTtcclxuIiwiaW1wb3J0IFdlYlNvY2tldCBmcm9tICcuL3dlYnNvY2tldCc7XHJcbmltcG9ydCBFdmVudFRhcmdldCBmcm9tICcuL2V2ZW50LXRhcmdldCc7XHJcbmltcG9ydCBuZXR3b3JrQnJpZGdlIGZyb20gJy4vbmV0d29yay1icmlkZ2UnO1xyXG5pbXBvcnQgQ0xPU0VfQ09ERVMgZnJvbSAnLi9oZWxwZXJzL2Nsb3NlLWNvZGVzJztcclxuaW1wb3J0IG5vcm1hbGl6ZSBmcm9tICcuL2hlbHBlcnMvbm9ybWFsaXplLXVybCc7XHJcbmltcG9ydCBnbG9iYWxPYmplY3QgZnJvbSAnLi9oZWxwZXJzL2dsb2JhbC1vYmplY3QnO1xyXG5pbXBvcnQgZGVkdXBlIGZyb20gJy4vaGVscGVycy9kZWR1cGUnO1xyXG5pbXBvcnQgeyBjcmVhdGVFdmVudCwgY3JlYXRlTWVzc2FnZUV2ZW50LCBjcmVhdGVDbG9zZUV2ZW50IH0gZnJvbSAnLi9ldmVudC1mYWN0b3J5JztcclxuXHJcbi8qXHJcbiogaHR0cHM6Ly9naXRodWIuY29tL3dlYnNvY2tldHMvd3Mjc2VydmVyLWV4YW1wbGVcclxuKi9cclxuY2xhc3MgU2VydmVyIGV4dGVuZHMgRXZlbnRUYXJnZXQge1xyXG4gIC8qXHJcbiAgKiBAcGFyYW0ge3N0cmluZ30gdXJsXHJcbiAgKi9cclxuICBjb25zdHJ1Y3Rvcih1cmwsIG9wdGlvbnMgPSB7fSkge1xyXG4gICAgc3VwZXIoKTtcclxuICAgIHRoaXMudXJsID0gbm9ybWFsaXplKHVybCk7XHJcbiAgICB0aGlzLm9yaWdpbmFsV2ViU29ja2V0ID0gbnVsbDtcclxuICAgIGNvbnN0IHNlcnZlciA9IG5ldHdvcmtCcmlkZ2UuYXR0YWNoU2VydmVyKHRoaXMsIHRoaXMudXJsKTtcclxuXHJcbiAgICBpZiAoIXNlcnZlcikge1xyXG4gICAgICB0aGlzLmRpc3BhdGNoRXZlbnQoY3JlYXRlRXZlbnQoeyB0eXBlOiAnZXJyb3InIH0pKTtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBIG1vY2sgc2VydmVyIGlzIGFscmVhZHkgbGlzdGVuaW5nIG9uIHRoaXMgdXJsJyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiBvcHRpb25zLnZlcmlmeUNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgb3B0aW9ucy52ZXJpZnlDbGllbnQgPSBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XHJcblxyXG4gICAgdGhpcy5zdGFydCgpO1xyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIEF0dGFjaGVzIHRoZSBtb2NrIHdlYnNvY2tldCBvYmplY3QgdG8gdGhlIGdsb2JhbCBvYmplY3RcclxuICAqL1xyXG4gIHN0YXJ0KCkge1xyXG4gICAgY29uc3QgZ2xvYmFsT2JqID0gZ2xvYmFsT2JqZWN0KCk7XHJcblxyXG4gICAgaWYgKGdsb2JhbE9iai5XZWJTb2NrZXQpIHtcclxuICAgICAgdGhpcy5vcmlnaW5hbFdlYlNvY2tldCA9IGdsb2JhbE9iai5XZWJTb2NrZXQ7XHJcbiAgICB9XHJcblxyXG4gICAgZ2xvYmFsT2JqLldlYlNvY2tldCA9IFdlYlNvY2tldDtcclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBSZW1vdmVzIHRoZSBtb2NrIHdlYnNvY2tldCBvYmplY3QgZnJvbSB0aGUgZ2xvYmFsIG9iamVjdFxyXG4gICovXHJcbiAgc3RvcChjYWxsYmFjayA9ICgpID0+IHt9KSB7XHJcbiAgICBjb25zdCBnbG9iYWxPYmogPSBnbG9iYWxPYmplY3QoKTtcclxuXHJcbiAgICBpZiAodGhpcy5vcmlnaW5hbFdlYlNvY2tldCkge1xyXG4gICAgICBnbG9iYWxPYmouV2ViU29ja2V0ID0gdGhpcy5vcmlnaW5hbFdlYlNvY2tldDtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGRlbGV0ZSBnbG9iYWxPYmouV2ViU29ja2V0O1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMub3JpZ2luYWxXZWJTb2NrZXQgPSBudWxsO1xyXG5cclxuICAgIG5ldHdvcmtCcmlkZ2UucmVtb3ZlU2VydmVyKHRoaXMudXJsKTtcclxuXHJcbiAgICBpZiAodHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgIGNhbGxiYWNrKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogVGhpcyBpcyB0aGUgbWFpbiBmdW5jdGlvbiBmb3IgdGhlIG1vY2sgc2VydmVyIHRvIHN1YnNjcmliZSB0byB0aGUgb24gZXZlbnRzLlxyXG4gICpcclxuICAqIGllOiBtb2NrU2VydmVyLm9uKCdjb25uZWN0aW9uJywgZnVuY3Rpb24oKSB7IGNvbnNvbGUubG9nKCdhIG1vY2sgY2xpZW50IGNvbm5lY3RlZCcpOyB9KTtcclxuICAqXHJcbiAgKiBAcGFyYW0ge3N0cmluZ30gdHlwZSAtIFRoZSBldmVudCBrZXkgdG8gc3Vic2NyaWJlIHRvLiBWYWxpZCBrZXlzIGFyZTogY29ubmVjdGlvbiwgbWVzc2FnZSwgYW5kIGNsb3NlLlxyXG4gICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBUaGUgY2FsbGJhY2sgd2hpY2ggc2hvdWxkIGJlIGNhbGxlZCB3aGVuIGEgY2VydGFpbiBldmVudCBpcyBmaXJlZC5cclxuICAqL1xyXG4gIG9uKHR5cGUsIGNhbGxiYWNrKSB7XHJcbiAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgY2FsbGJhY2spO1xyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIFRoaXMgc2VuZCBmdW5jdGlvbiB3aWxsIG5vdGlmeSBhbGwgbW9jayBjbGllbnRzIHZpYSB0aGVpciBvbm1lc3NhZ2UgY2FsbGJhY2tzIHRoYXQgdGhlIHNlcnZlclxyXG4gICogaGFzIGEgbWVzc2FnZSBmb3IgdGhlbS5cclxuICAqXHJcbiAgKiBAcGFyYW0geyp9IGRhdGEgLSBBbnkgamF2YXNjcmlwdCBvYmplY3Qgd2hpY2ggd2lsbCBiZSBjcmFmdGVkIGludG8gYSBNZXNzYWdlT2JqZWN0LlxyXG4gICovXHJcbiAgc2VuZChkYXRhLCBvcHRpb25zID0ge30pIHtcclxuICAgIHRoaXMuZW1pdCgnbWVzc2FnZScsIGRhdGEsIG9wdGlvbnMpO1xyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIFNlbmRzIGEgZ2VuZXJpYyBtZXNzYWdlIGV2ZW50IHRvIGFsbCBtb2NrIGNsaWVudHMuXHJcbiAgKi9cclxuICBlbWl0KGV2ZW50LCBkYXRhLCBvcHRpb25zID0ge30pIHtcclxuICAgIGxldCB7IHdlYnNvY2tldHMgfSA9IG9wdGlvbnM7XHJcblxyXG4gICAgaWYgKCF3ZWJzb2NrZXRzKSB7XHJcbiAgICAgIHdlYnNvY2tldHMgPSBuZXR3b3JrQnJpZGdlLndlYnNvY2tldHNMb29rdXAodGhpcy51cmwpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyAhPT0gJ29iamVjdCcgfHwgYXJndW1lbnRzLmxlbmd0aCA+IDMpIHtcclxuICAgICAgZGF0YSA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSwgYXJndW1lbnRzLmxlbmd0aCk7XHJcbiAgICB9XHJcblxyXG4gICAgd2Vic29ja2V0cy5mb3JFYWNoKHNvY2tldCA9PiB7XHJcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XHJcbiAgICAgICAgc29ja2V0LmRpc3BhdGNoRXZlbnQoXHJcbiAgICAgICAgICBjcmVhdGVNZXNzYWdlRXZlbnQoe1xyXG4gICAgICAgICAgICB0eXBlOiBldmVudCxcclxuICAgICAgICAgICAgZGF0YSxcclxuICAgICAgICAgICAgb3JpZ2luOiB0aGlzLnVybCxcclxuICAgICAgICAgICAgdGFyZ2V0OiBzb2NrZXRcclxuICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgLi4uZGF0YVxyXG4gICAgICAgICk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgc29ja2V0LmRpc3BhdGNoRXZlbnQoXHJcbiAgICAgICAgICBjcmVhdGVNZXNzYWdlRXZlbnQoe1xyXG4gICAgICAgICAgICB0eXBlOiBldmVudCxcclxuICAgICAgICAgICAgZGF0YSxcclxuICAgICAgICAgICAgb3JpZ2luOiB0aGlzLnVybCxcclxuICAgICAgICAgICAgdGFyZ2V0OiBzb2NrZXRcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogQ2xvc2VzIHRoZSBjb25uZWN0aW9uIGFuZCB0cmlnZ2VycyB0aGUgb25jbG9zZSBtZXRob2Qgb2YgYWxsIGxpc3RlbmluZ1xyXG4gICogd2Vic29ja2V0cy4gQWZ0ZXIgdGhhdCBpdCByZW1vdmVzIGl0c2VsZiBmcm9tIHRoZSB1cmxNYXAgc28gYW5vdGhlciBzZXJ2ZXJcclxuICAqIGNvdWxkIGFkZCBpdHNlbGYgdG8gdGhlIHVybC5cclxuICAqXHJcbiAgKiBAcGFyYW0ge29iamVjdH0gb3B0aW9uc1xyXG4gICovXHJcbiAgY2xvc2Uob3B0aW9ucyA9IHt9KSB7XHJcbiAgICBjb25zdCB7IGNvZGUsIHJlYXNvbiwgd2FzQ2xlYW4gfSA9IG9wdGlvbnM7XHJcbiAgICBjb25zdCBsaXN0ZW5lcnMgPSBuZXR3b3JrQnJpZGdlLndlYnNvY2tldHNMb29rdXAodGhpcy51cmwpO1xyXG5cclxuICAgIC8vIFJlbW92ZSBzZXJ2ZXIgYmVmb3JlIG5vdGlmaWNhdGlvbnMgdG8gcHJldmVudCBpbW1lZGlhdGUgcmVjb25uZWN0cyBmcm9tXHJcbiAgICAvLyBzb2NrZXQgb25jbG9zZSBoYW5kbGVyc1xyXG4gICAgbmV0d29ya0JyaWRnZS5yZW1vdmVTZXJ2ZXIodGhpcy51cmwpO1xyXG5cclxuICAgIGxpc3RlbmVycy5mb3JFYWNoKHNvY2tldCA9PiB7XHJcbiAgICAgIHNvY2tldC5yZWFkeVN0YXRlID0gV2ViU29ja2V0LkNMT1NFO1xyXG4gICAgICBzb2NrZXQuZGlzcGF0Y2hFdmVudChcclxuICAgICAgICBjcmVhdGVDbG9zZUV2ZW50KHtcclxuICAgICAgICAgIHR5cGU6ICdjbG9zZScsXHJcbiAgICAgICAgICB0YXJnZXQ6IHNvY2tldCxcclxuICAgICAgICAgIGNvZGU6IGNvZGUgfHwgQ0xPU0VfQ09ERVMuQ0xPU0VfTk9STUFMLFxyXG4gICAgICAgICAgcmVhc29uOiByZWFzb24gfHwgJycsXHJcbiAgICAgICAgICB3YXNDbGVhblxyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmRpc3BhdGNoRXZlbnQoY3JlYXRlQ2xvc2VFdmVudCh7IHR5cGU6ICdjbG9zZScgfSksIHRoaXMpO1xyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIFJldHVybnMgYW4gYXJyYXkgb2Ygd2Vic29ja2V0cyB3aGljaCBhcmUgbGlzdGVuaW5nIHRvIHRoaXMgc2VydmVyXHJcbiAgKi9cclxuICBjbGllbnRzKCkge1xyXG4gICAgcmV0dXJuIG5ldHdvcmtCcmlkZ2Uud2Vic29ja2V0c0xvb2t1cCh0aGlzLnVybCk7XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogUHJlcGFyZXMgYSBtZXRob2QgdG8gc3VibWl0IGFuIGV2ZW50IHRvIG1lbWJlcnMgb2YgdGhlIHJvb21cclxuICAqXHJcbiAgKiBlLmcuIHNlcnZlci50bygnbXktcm9vbScpLmVtaXQoJ2hpIScpO1xyXG4gICovXHJcbiAgdG8ocm9vbSwgYnJvYWRjYXN0ZXIsIGJyb2FkY2FzdExpc3QgPSBbXSkge1xyXG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XHJcbiAgICBjb25zdCB3ZWJzb2NrZXRzID0gZGVkdXBlKGJyb2FkY2FzdExpc3QuY29uY2F0KG5ldHdvcmtCcmlkZ2Uud2Vic29ja2V0c0xvb2t1cCh0aGlzLnVybCwgcm9vbSwgYnJvYWRjYXN0ZXIpKSk7XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgdG86IChjaGFpbmVkUm9vbSwgY2hhaW5lZEJyb2FkY2FzdGVyKSA9PiB0aGlzLnRvLmNhbGwodGhpcywgY2hhaW5lZFJvb20sIGNoYWluZWRCcm9hZGNhc3Rlciwgd2Vic29ja2V0cyksXHJcbiAgICAgIGVtaXQoZXZlbnQsIGRhdGEpIHtcclxuICAgICAgICBzZWxmLmVtaXQoZXZlbnQsIGRhdGEsIHsgd2Vic29ja2V0cyB9KTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qXHJcbiAgICogQWxpYXMgZm9yIFNlcnZlci50b1xyXG4gICAqL1xyXG4gIGluKC4uLmFyZ3MpIHtcclxuICAgIHJldHVybiB0aGlzLnRvLmFwcGx5KG51bGwsIGFyZ3MpO1xyXG4gIH1cclxufVxyXG5cclxuLypcclxuICogQWx0ZXJuYXRpdmUgY29uc3RydWN0b3IgdG8gc3VwcG9ydCBuYW1lc3BhY2VzIGluIHNvY2tldC5pb1xyXG4gKlxyXG4gKiBodHRwOi8vc29ja2V0LmlvL2RvY3Mvcm9vbXMtYW5kLW5hbWVzcGFjZXMvI2N1c3RvbS1uYW1lc3BhY2VzXHJcbiAqL1xyXG5TZXJ2ZXIub2YgPSBmdW5jdGlvbiBvZih1cmwpIHtcclxuICByZXR1cm4gbmV3IFNlcnZlcih1cmwpO1xyXG59O1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgU2VydmVyO1xyXG4iLCJpbXBvcnQgZGVsYXkgZnJvbSAnLi9oZWxwZXJzL2RlbGF5JztcclxuaW1wb3J0IEV2ZW50VGFyZ2V0IGZyb20gJy4vZXZlbnQtdGFyZ2V0JztcclxuaW1wb3J0IG5ldHdvcmtCcmlkZ2UgZnJvbSAnLi9uZXR3b3JrLWJyaWRnZSc7XHJcbmltcG9ydCBDTE9TRV9DT0RFUyBmcm9tICcuL2hlbHBlcnMvY2xvc2UtY29kZXMnO1xyXG5pbXBvcnQgbm9ybWFsaXplIGZyb20gJy4vaGVscGVycy9ub3JtYWxpemUtdXJsJztcclxuaW1wb3J0IGxvZ2dlciBmcm9tICcuL2hlbHBlcnMvbG9nZ2VyJztcclxuaW1wb3J0IHsgY3JlYXRlRXZlbnQsIGNyZWF0ZU1lc3NhZ2VFdmVudCwgY3JlYXRlQ2xvc2VFdmVudCB9IGZyb20gJy4vZXZlbnQtZmFjdG9yeSc7XHJcblxyXG4vKlxyXG4qIFRoZSBzb2NrZXQtaW8gY2xhc3MgaXMgZGVzaWduZWQgdG8gbWltaWNrIHRoZSByZWFsIEFQSSBhcyBjbG9zZWx5IGFzIHBvc3NpYmxlLlxyXG4qXHJcbiogaHR0cDovL3NvY2tldC5pby9kb2NzL1xyXG4qL1xyXG5jbGFzcyBTb2NrZXRJTyBleHRlbmRzIEV2ZW50VGFyZ2V0IHtcclxuICAvKlxyXG4gICogQHBhcmFtIHtzdHJpbmd9IHVybFxyXG4gICovXHJcbiAgY29uc3RydWN0b3IodXJsID0gJ3NvY2tldC5pbycsIHByb3RvY29sID0gJycpIHtcclxuICAgIHN1cGVyKCk7XHJcblxyXG4gICAgdGhpcy5iaW5hcnlUeXBlID0gJ2Jsb2InO1xyXG4gICAgdGhpcy51cmwgPSBub3JtYWxpemUodXJsKTtcclxuICAgIHRoaXMucmVhZHlTdGF0ZSA9IFNvY2tldElPLkNPTk5FQ1RJTkc7XHJcbiAgICB0aGlzLnByb3RvY29sID0gJyc7XHJcblxyXG4gICAgaWYgKHR5cGVvZiBwcm90b2NvbCA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgdGhpcy5wcm90b2NvbCA9IHByb3RvY29sO1xyXG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHByb3RvY29sKSAmJiBwcm90b2NvbC5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHRoaXMucHJvdG9jb2wgPSBwcm90b2NvbFswXTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzZXJ2ZXIgPSBuZXR3b3JrQnJpZGdlLmF0dGFjaFdlYlNvY2tldCh0aGlzLCB0aGlzLnVybCk7XHJcblxyXG4gICAgLypcclxuICAgICogRGVsYXkgdHJpZ2dlcmluZyB0aGUgY29ubmVjdGlvbiBldmVudHMgc28gdGhleSBjYW4gYmUgZGVmaW5lZCBpbiB0aW1lLlxyXG4gICAgKi9cclxuICAgIGRlbGF5KGZ1bmN0aW9uIGRlbGF5Q2FsbGJhY2soKSB7XHJcbiAgICAgIGlmIChzZXJ2ZXIpIHtcclxuICAgICAgICB0aGlzLnJlYWR5U3RhdGUgPSBTb2NrZXRJTy5PUEVOO1xyXG4gICAgICAgIHNlcnZlci5kaXNwYXRjaEV2ZW50KGNyZWF0ZUV2ZW50KHsgdHlwZTogJ2Nvbm5lY3Rpb24nIH0pLCBzZXJ2ZXIsIHRoaXMpO1xyXG4gICAgICAgIHNlcnZlci5kaXNwYXRjaEV2ZW50KGNyZWF0ZUV2ZW50KHsgdHlwZTogJ2Nvbm5lY3QnIH0pLCBzZXJ2ZXIsIHRoaXMpOyAvLyBhbGlhc1xyXG4gICAgICAgIHRoaXMuZGlzcGF0Y2hFdmVudChjcmVhdGVFdmVudCh7IHR5cGU6ICdjb25uZWN0JywgdGFyZ2V0OiB0aGlzIH0pKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLnJlYWR5U3RhdGUgPSBTb2NrZXRJTy5DTE9TRUQ7XHJcbiAgICAgICAgdGhpcy5kaXNwYXRjaEV2ZW50KGNyZWF0ZUV2ZW50KHsgdHlwZTogJ2Vycm9yJywgdGFyZ2V0OiB0aGlzIH0pKTtcclxuICAgICAgICB0aGlzLmRpc3BhdGNoRXZlbnQoXHJcbiAgICAgICAgICBjcmVhdGVDbG9zZUV2ZW50KHtcclxuICAgICAgICAgICAgdHlwZTogJ2Nsb3NlJyxcclxuICAgICAgICAgICAgdGFyZ2V0OiB0aGlzLFxyXG4gICAgICAgICAgICBjb2RlOiBDTE9TRV9DT0RFUy5DTE9TRV9OT1JNQUxcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgbG9nZ2VyKCdlcnJvcicsIGBTb2NrZXQuaW8gY29ubmVjdGlvbiB0byAnJHt0aGlzLnVybH0nIGZhaWxlZGApO1xyXG4gICAgICB9XHJcbiAgICB9LCB0aGlzKTtcclxuXHJcbiAgICAvKipcclxuICAgICAgQWRkIGFuIGFsaWFzZWQgZXZlbnQgbGlzdGVuZXIgZm9yIGNsb3NlIC8gZGlzY29ubmVjdFxyXG4gICAgICovXHJcbiAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2Nsb3NlJywgZXZlbnQgPT4ge1xyXG4gICAgICB0aGlzLmRpc3BhdGNoRXZlbnQoXHJcbiAgICAgICAgY3JlYXRlQ2xvc2VFdmVudCh7XHJcbiAgICAgICAgICB0eXBlOiAnZGlzY29ubmVjdCcsXHJcbiAgICAgICAgICB0YXJnZXQ6IGV2ZW50LnRhcmdldCxcclxuICAgICAgICAgIGNvZGU6IGV2ZW50LmNvZGVcclxuICAgICAgICB9KVxyXG4gICAgICApO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogQ2xvc2VzIHRoZSBTb2NrZXRJTyBjb25uZWN0aW9uIG9yIGNvbm5lY3Rpb24gYXR0ZW1wdCwgaWYgYW55LlxyXG4gICogSWYgdGhlIGNvbm5lY3Rpb24gaXMgYWxyZWFkeSBDTE9TRUQsIHRoaXMgbWV0aG9kIGRvZXMgbm90aGluZy5cclxuICAqL1xyXG4gIGNsb3NlKCkge1xyXG4gICAgaWYgKHRoaXMucmVhZHlTdGF0ZSAhPT0gU29ja2V0SU8uT1BFTikge1xyXG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHNlcnZlciA9IG5ldHdvcmtCcmlkZ2Uuc2VydmVyTG9va3VwKHRoaXMudXJsKTtcclxuICAgIG5ldHdvcmtCcmlkZ2UucmVtb3ZlV2ViU29ja2V0KHRoaXMsIHRoaXMudXJsKTtcclxuXHJcbiAgICB0aGlzLnJlYWR5U3RhdGUgPSBTb2NrZXRJTy5DTE9TRUQ7XHJcbiAgICB0aGlzLmRpc3BhdGNoRXZlbnQoXHJcbiAgICAgIGNyZWF0ZUNsb3NlRXZlbnQoe1xyXG4gICAgICAgIHR5cGU6ICdjbG9zZScsXHJcbiAgICAgICAgdGFyZ2V0OiB0aGlzLFxyXG4gICAgICAgIGNvZGU6IENMT1NFX0NPREVTLkNMT1NFX05PUk1BTFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAoc2VydmVyKSB7XHJcbiAgICAgIHNlcnZlci5kaXNwYXRjaEV2ZW50KFxyXG4gICAgICAgIGNyZWF0ZUNsb3NlRXZlbnQoe1xyXG4gICAgICAgICAgdHlwZTogJ2Rpc2Nvbm5lY3QnLFxyXG4gICAgICAgICAgdGFyZ2V0OiB0aGlzLFxyXG4gICAgICAgICAgY29kZTogQ0xPU0VfQ09ERVMuQ0xPU0VfTk9STUFMXHJcbiAgICAgICAgfSksXHJcbiAgICAgICAgc2VydmVyXHJcbiAgICAgICk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogQWxpYXMgZm9yIFNvY2tldCNjbG9zZVxyXG4gICpcclxuICAqIGh0dHBzOi8vZ2l0aHViLmNvbS9zb2NrZXRpby9zb2NrZXQuaW8tY2xpZW50L2Jsb2IvbWFzdGVyL2xpYi9zb2NrZXQuanMjTDM4M1xyXG4gICovXHJcbiAgZGlzY29ubmVjdCgpIHtcclxuICAgIHRoaXMuY2xvc2UoKTtcclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBTdWJtaXRzIGFuIGV2ZW50IHRvIHRoZSBzZXJ2ZXIgd2l0aCBhIHBheWxvYWRcclxuICAqL1xyXG4gIGVtaXQoZXZlbnQsIC4uLmRhdGEpIHtcclxuICAgIGlmICh0aGlzLnJlYWR5U3RhdGUgIT09IFNvY2tldElPLk9QRU4pIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdTb2NrZXRJTyBpcyBhbHJlYWR5IGluIENMT1NJTkcgb3IgQ0xPU0VEIHN0YXRlJyk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbWVzc2FnZUV2ZW50ID0gY3JlYXRlTWVzc2FnZUV2ZW50KHtcclxuICAgICAgdHlwZTogZXZlbnQsXHJcbiAgICAgIG9yaWdpbjogdGhpcy51cmwsXHJcbiAgICAgIGRhdGFcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHNlcnZlciA9IG5ldHdvcmtCcmlkZ2Uuc2VydmVyTG9va3VwKHRoaXMudXJsKTtcclxuXHJcbiAgICBpZiAoc2VydmVyKSB7XHJcbiAgICAgIHNlcnZlci5kaXNwYXRjaEV2ZW50KG1lc3NhZ2VFdmVudCwgLi4uZGF0YSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICogU3VibWl0cyBhICdtZXNzYWdlJyBldmVudCB0byB0aGUgc2VydmVyLlxyXG4gICpcclxuICAqIFNob3VsZCBiZWhhdmUgZXhhY3RseSBsaWtlIFdlYlNvY2tldCNzZW5kXHJcbiAgKlxyXG4gICogaHR0cHM6Ly9naXRodWIuY29tL3NvY2tldGlvL3NvY2tldC5pby1jbGllbnQvYmxvYi9tYXN0ZXIvbGliL3NvY2tldC5qcyNMMTEzXHJcbiAgKi9cclxuICBzZW5kKGRhdGEpIHtcclxuICAgIHRoaXMuZW1pdCgnbWVzc2FnZScsIGRhdGEpO1xyXG4gIH1cclxuXHJcbiAgLypcclxuICAqIEZvciBicm9hZGNhc3RpbmcgZXZlbnRzIHRvIG90aGVyIGNvbm5lY3RlZCBzb2NrZXRzLlxyXG4gICpcclxuICAqIGUuZy4gc29ja2V0LmJyb2FkY2FzdC5lbWl0KCdoaSEnKTtcclxuICAqIGUuZy4gc29ja2V0LmJyb2FkY2FzdC50bygnbXktcm9vbScpLmVtaXQoJ2hpIScpO1xyXG4gICovXHJcbiAgZ2V0IGJyb2FkY2FzdCgpIHtcclxuICAgIGlmICh0aGlzLnJlYWR5U3RhdGUgIT09IFNvY2tldElPLk9QRU4pIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdTb2NrZXRJTyBpcyBhbHJlYWR5IGluIENMT1NJTkcgb3IgQ0xPU0VEIHN0YXRlJyk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XHJcbiAgICBjb25zdCBzZXJ2ZXIgPSBuZXR3b3JrQnJpZGdlLnNlcnZlckxvb2t1cCh0aGlzLnVybCk7XHJcbiAgICBpZiAoIXNlcnZlcikge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFNvY2tldElPIGNhbiBub3QgZmluZCBhIHNlcnZlciBhdCB0aGUgc3BlY2lmaWVkIFVSTCAoJHt0aGlzLnVybH0pYCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgZW1pdChldmVudCwgZGF0YSkge1xyXG4gICAgICAgIHNlcnZlci5lbWl0KGV2ZW50LCBkYXRhLCB7IHdlYnNvY2tldHM6IG5ldHdvcmtCcmlkZ2Uud2Vic29ja2V0c0xvb2t1cChzZWxmLnVybCwgbnVsbCwgc2VsZikgfSk7XHJcbiAgICAgIH0sXHJcbiAgICAgIHRvKHJvb20pIHtcclxuICAgICAgICByZXR1cm4gc2VydmVyLnRvKHJvb20sIHNlbGYpO1xyXG4gICAgICB9LFxyXG4gICAgICBpbihyb29tKSB7XHJcbiAgICAgICAgcmV0dXJuIHNlcnZlci5pbihyb29tLCBzZWxmKTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qXHJcbiAgKiBGb3IgcmVnaXN0ZXJpbmcgZXZlbnRzIHRvIGJlIHJlY2VpdmVkIGZyb20gdGhlIHNlcnZlclxyXG4gICovXHJcbiAgb24odHlwZSwgY2FsbGJhY2spIHtcclxuICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBjYWxsYmFjayk7XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICAqIFJlbW92ZSBldmVudCBsaXN0ZW5lclxyXG4gICAqXHJcbiAgICogaHR0cHM6Ly9zb2NrZXQuaW8vZG9jcy9jbGllbnQtYXBpLyNzb2NrZXQtb24tZXZlbnRuYW1lLWNhbGxiYWNrXHJcbiAgICovXHJcbiAgb2ZmKHR5cGUpIHtcclxuICAgIHRoaXMucmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlKTtcclxuICB9XHJcblxyXG4gIC8qXHJcbiAgICogSm9pbiBhIHJvb20gb24gYSBzZXJ2ZXJcclxuICAgKlxyXG4gICAqIGh0dHA6Ly9zb2NrZXQuaW8vZG9jcy9yb29tcy1hbmQtbmFtZXNwYWNlcy8jam9pbmluZy1hbmQtbGVhdmluZ1xyXG4gICAqL1xyXG4gIGpvaW4ocm9vbSkge1xyXG4gICAgbmV0d29ya0JyaWRnZS5hZGRNZW1iZXJzaGlwVG9Sb29tKHRoaXMsIHJvb20pO1xyXG4gIH1cclxuXHJcbiAgLypcclxuICAgKiBHZXQgdGhlIHdlYnNvY2tldCB0byBsZWF2ZSB0aGUgcm9vbVxyXG4gICAqXHJcbiAgICogaHR0cDovL3NvY2tldC5pby9kb2NzL3Jvb21zLWFuZC1uYW1lc3BhY2VzLyNqb2luaW5nLWFuZC1sZWF2aW5nXHJcbiAgICovXHJcbiAgbGVhdmUocm9vbSkge1xyXG4gICAgbmV0d29ya0JyaWRnZS5yZW1vdmVNZW1iZXJzaGlwRnJvbVJvb20odGhpcywgcm9vbSk7XHJcbiAgfVxyXG5cclxuICB0byhyb29tKSB7XHJcbiAgICByZXR1cm4gdGhpcy5icm9hZGNhc3QudG8ocm9vbSk7XHJcbiAgfVxyXG5cclxuICBpbigpIHtcclxuICAgIHJldHVybiB0aGlzLnRvLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XHJcbiAgfVxyXG5cclxuICAvKlxyXG4gICAqIEludm9rZXMgYWxsIGxpc3RlbmVyIGZ1bmN0aW9ucyB0aGF0IGFyZSBsaXN0ZW5pbmcgdG8gdGhlIGdpdmVuIGV2ZW50LnR5cGUgcHJvcGVydHkuIEVhY2hcclxuICAgKiBsaXN0ZW5lciB3aWxsIGJlIHBhc3NlZCB0aGUgZXZlbnQgYXMgdGhlIGZpcnN0IGFyZ3VtZW50LlxyXG4gICAqXHJcbiAgICogQHBhcmFtIHtvYmplY3R9IGV2ZW50IC0gZXZlbnQgb2JqZWN0IHdoaWNoIHdpbGwgYmUgcGFzc2VkIHRvIGFsbCBsaXN0ZW5lcnMgb2YgdGhlIGV2ZW50LnR5cGUgcHJvcGVydHlcclxuICAgKi9cclxuICBkaXNwYXRjaEV2ZW50KGV2ZW50LCAuLi5jdXN0b21Bcmd1bWVudHMpIHtcclxuICAgIGNvbnN0IGV2ZW50TmFtZSA9IGV2ZW50LnR5cGU7XHJcbiAgICBjb25zdCBsaXN0ZW5lcnMgPSB0aGlzLmxpc3RlbmVyc1tldmVudE5hbWVdO1xyXG5cclxuICAgIGlmICghQXJyYXkuaXNBcnJheShsaXN0ZW5lcnMpKSB7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBsaXN0ZW5lcnMuZm9yRWFjaChsaXN0ZW5lciA9PiB7XHJcbiAgICAgIGlmIChjdXN0b21Bcmd1bWVudHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGxpc3RlbmVyLmFwcGx5KHRoaXMsIGN1c3RvbUFyZ3VtZW50cyk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gUmVndWxhciBXZWJTb2NrZXRzIGV4cGVjdCBhIE1lc3NhZ2VFdmVudCBidXQgU29ja2V0aW8uaW8ganVzdCB3YW50cyByYXcgZGF0YVxyXG4gICAgICAgIC8vICBwYXlsb2FkIGluc3RhbmNlb2YgTWVzc2FnZUV2ZW50IHdvcmtzLCBidXQgeW91IGNhbid0IGlzbnRhbmNlIG9mIE5vZGVFdmVudFxyXG4gICAgICAgIC8vICBmb3Igbm93IHdlIGRldGVjdCBpZiB0aGUgb3V0cHV0IGhhcyBkYXRhIGRlZmluZWQgb24gaXRcclxuICAgICAgICBsaXN0ZW5lci5jYWxsKHRoaXMsIGV2ZW50LmRhdGEgPyBldmVudC5kYXRhIDogZXZlbnQpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuXHJcblNvY2tldElPLkNPTk5FQ1RJTkcgPSAwO1xyXG5Tb2NrZXRJTy5PUEVOID0gMTtcclxuU29ja2V0SU8uQ0xPU0lORyA9IDI7XHJcblNvY2tldElPLkNMT1NFRCA9IDM7XHJcblxyXG4vKlxyXG4qIFN0YXRpYyBjb25zdHJ1Y3RvciBtZXRob2RzIGZvciB0aGUgSU8gU29ja2V0XHJcbiovXHJcbmNvbnN0IElPID0gZnVuY3Rpb24gaW9Db25zdHJ1Y3Rvcih1cmwpIHtcclxuICByZXR1cm4gbmV3IFNvY2tldElPKHVybCk7XHJcbn07XHJcblxyXG4vKlxyXG4qIEFsaWFzIHRoZSByYXcgSU8oKSBjb25zdHJ1Y3RvclxyXG4qL1xyXG5JTy5jb25uZWN0ID0gZnVuY3Rpb24gaW9Db25uZWN0KHVybCkge1xyXG4gIC8qIGVzbGludC1kaXNhYmxlIG5ldy1jYXAgKi9cclxuICByZXR1cm4gSU8odXJsKTtcclxuICAvKiBlc2xpbnQtZW5hYmxlIG5ldy1jYXAgKi9cclxufTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IElPO1xyXG4iLCJpbXBvcnQgTW9ja1NlcnZlciBmcm9tICcuL3NlcnZlcic7XHJcbmltcG9ydCBNb2NrU29ja2V0SU8gZnJvbSAnLi9zb2NrZXQtaW8nO1xyXG5pbXBvcnQgTW9ja1dlYlNvY2tldCBmcm9tICcuL3dlYnNvY2tldCc7XHJcblxyXG5leHBvcnQgY29uc3QgU2VydmVyID0gTW9ja1NlcnZlcjtcclxuZXhwb3J0IGNvbnN0IFdlYlNvY2tldCA9IE1vY2tXZWJTb2NrZXQ7XHJcbmV4cG9ydCBjb25zdCBTb2NrZXRJTyA9IE1vY2tTb2NrZXRJTztcclxuIl0sIm5hbWVzIjpbImNvbnN0IiwidGhpcyIsInN1cGVyIiwiV2ViU29ja2V0Iiwibm9ybWFsaXplIiwibG9nZ2VyIiwiQ0xPU0VfQ09ERVMiLCJTZXJ2ZXIiLCJnbG9iYWxPYmplY3QiLCJTb2NrZXRJTyIsIk1vY2tTZXJ2ZXIiLCJNb2NrV2ViU29ja2V0IiwiTW9ja1NvY2tldElPIl0sIm1hcHBpbmdzIjoiOztBQUFBOzs7Ozs7OztBQVFBLEFBQWUsU0FBUyxLQUFLLENBQUMsUUFBUSxFQUFFLE9BQU8sRUFBRTtFQUMvQyxVQUFVLENBQUMsVUFBQSxjQUFjLEVBQUMsU0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFBLEVBQUUsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0NBQ3pFOztBQ1ZNLFNBQVMsTUFBTSxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUU7RUFDdENBLElBQU0sT0FBTyxHQUFHLEVBQUUsQ0FBQztFQUNuQixLQUFLLENBQUMsT0FBTyxDQUFDLFVBQUEsV0FBVyxFQUFDO0lBQ3hCLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLEVBQUU7TUFDMUIsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztLQUMzQjtHQUNGLENBQUMsQ0FBQzs7RUFFSCxPQUFPLE9BQU8sQ0FBQztDQUNoQjs7QUFFRCxBQUFPLFNBQVMsTUFBTSxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUU7RUFDdENBLElBQU0sT0FBTyxHQUFHLEVBQUUsQ0FBQztFQUNuQixLQUFLLENBQUMsT0FBTyxDQUFDLFVBQUEsV0FBVyxFQUFDO0lBQ3hCLElBQUksUUFBUSxDQUFDLFdBQVcsQ0FBQyxFQUFFO01BQ3pCLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7S0FDM0I7R0FDRixDQUFDLENBQUM7O0VBRUgsT0FBTyxPQUFPLENBQUM7Q0FDaEI7Ozs7Ozs7O0FDWkQsSUFBTSxXQUFXLEdBQUMsb0JBQ0wsR0FBRztFQUNkLElBQU0sQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO0NBQ3JCLENBQUE7Ozs7Ozs7Ozs7QUFVSCxzQkFBRSxnQkFBZ0IsOEJBQUMsSUFBSSxFQUFFLFFBQVEscUJBQXFCO0VBQ3BELElBQU0sT0FBTyxRQUFRLEtBQUssVUFBVSxFQUFFO0lBQ3BDLElBQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRTtNQUMxQyxJQUFNLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztLQUMzQjs7O0lBR0gsSUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxVQUFBLElBQUksRUFBQyxTQUFHLElBQUksS0FBSyxRQUFRLEdBQUEsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7TUFDMUUsSUFBTSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7S0FDckM7R0FDRjtDQUNGLENBQUE7Ozs7Ozs7OztBQVNILHNCQUFFLG1CQUFtQixpQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLHFCQUFxQjtFQUMvRCxJQUFRLGdCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7RUFDaEQsSUFBTSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsVUFBQSxRQUFRLEVBQUMsU0FBRyxRQUFRLEtBQUssZ0JBQWdCLEdBQUEsQ0FBQyxDQUFDO0NBQzVGLENBQUE7Ozs7Ozs7O0FBUUgsc0JBQUUsYUFBYSwyQkFBQyxLQUFLLEVBQXNCOzs7OztFQUN6QyxJQUFRLFNBQVMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO0VBQy9CLElBQVEsU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUM7O0VBRTlDLElBQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFO0lBQy9CLE9BQVMsS0FBSyxDQUFDO0dBQ2Q7O0VBRUgsU0FBVyxDQUFDLE9BQU8sQ0FBQyxVQUFBLFFBQVEsRUFBQztJQUMzQixJQUFNLGVBQWUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO01BQ2hDLFFBQVUsQ0FBQyxLQUFLLENBQUNDLE1BQUksRUFBRSxlQUFlLENBQUMsQ0FBQztLQUN2QyxNQUFNO01BQ1AsUUFBVSxDQUFDLElBQUksQ0FBQ0EsTUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0tBQzVCO0dBQ0YsQ0FBQyxDQUFDOztFQUVMLE9BQVMsSUFBSSxDQUFDO0NBQ2IsQ0FBQSxBQUdILEFBQTJCOzs7Ozs7O0FDakUzQixJQUFNLGFBQWEsR0FBQyxzQkFDUCxHQUFHO0VBQ2QsSUFBTSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7Q0FDbEIsQ0FBQTs7QUFFSCx3QkFBRSxtQkFBbUIsaUNBQUMsR0FBRyxFQUFFOzs7RUFDekIsSUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0VBQzFDLElBQU0sRUFBRSxnQkFBZ0IsRUFBRTtNQUN0QixJQUFRLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztNQUN4QyxJQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7TUFDWixPQUFTLEVBQUUsZ0JBQWdCLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUU7UUFDOUMsSUFBTSxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO1VBQzdCLGdCQUFrQixHQUFHQSxNQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ3pDO1FBQ0gsQ0FBRyxFQUFFLENBQUM7T0FDTDtHQUNKO0VBQ0gsT0FBUyxnQkFBZ0IsQ0FBQztDQUN6QixDQUFBOzs7Ozs7OztBQVFILHdCQUFFLGVBQWUsNkJBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRTtFQUNoQyxJQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQztFQUN2RCxJQUFNLGdCQUFnQixJQUFJLGdCQUFnQixDQUFDLE1BQU0sSUFBSSxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFO0lBQzFHLGdCQUFrQixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDOUMsT0FBUyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUM7R0FDaEM7Q0FDRixDQUFBOzs7OztBQUtILHdCQUFFLG1CQUFtQixpQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFO0VBQ3JDLElBQVEsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQzs7RUFFbkUsSUFBTSxnQkFBZ0IsSUFBSSxnQkFBZ0IsQ0FBQyxNQUFNLElBQUksZ0JBQWdCLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRTtJQUMxRyxJQUFNLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxFQUFFO01BQzdDLGdCQUFrQixDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7S0FDN0M7O0lBRUgsZ0JBQWtCLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztHQUN4RDtDQUNGLENBQUE7Ozs7Ozs7OztBQVNILHdCQUFFLFlBQVksMEJBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRTtFQUMxQixJQUFRLGdCQUFnQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQzs7RUFFekQsSUFBTSxDQUFDLGdCQUFnQixFQUFFO0lBQ3ZCLElBQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUc7TUFDbkIsUUFBRSxNQUFNO01BQ1IsVUFBWSxFQUFFLEVBQUU7TUFDaEIsZUFBaUIsRUFBRSxFQUFFO0tBQ3BCLENBQUM7O0lBRUosT0FBUyxNQUFNLENBQUM7R0FDZjtDQUNGLENBQUE7Ozs7Ozs7QUFPSCx3QkFBRSxZQUFZLDBCQUFDLEdBQUcsRUFBRTtFQUNsQixJQUFRLGdCQUFnQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQzs7RUFFekQsSUFBTSxnQkFBZ0IsRUFBRTtJQUN0QixPQUFTLGdCQUFnQixDQUFDLE1BQU0sQ0FBQztHQUNoQztDQUNGLENBQUE7Ozs7Ozs7OztBQVNILHdCQUFFLGdCQUFnQiw4QkFBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRTtFQUN6QyxJQUFNLFVBQVUsQ0FBQztFQUNqQixJQUFRLGdCQUFnQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQzs7RUFFekQsVUFBWSxHQUFHLGdCQUFnQixHQUFHLGdCQUFnQixDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7O0VBRW5FLElBQU0sSUFBSSxFQUFFO0lBQ1YsSUFBUSxPQUFPLEdBQUcsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3pELFVBQVksR0FBRyxPQUFPLElBQUksRUFBRSxDQUFDO0dBQzVCOztFQUVILE9BQVMsV0FBVyxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsVUFBQSxTQUFTLEVBQUMsU0FBRyxTQUFTLEtBQUssV0FBVyxHQUFBLENBQUMsR0FBRyxVQUFVLENBQUM7Q0FDN0YsQ0FBQTs7Ozs7OztBQU9ILHdCQUFFLFlBQVksMEJBQUMsR0FBRyxFQUFFO0VBQ2xCLE9BQVMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztDQUN6QixDQUFBOzs7Ozs7OztBQVFILHdCQUFFLGVBQWUsNkJBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRTtFQUNoQyxJQUFRLGdCQUFnQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQzs7RUFFekQsSUFBTSxnQkFBZ0IsRUFBRTtJQUN0QixnQkFBa0IsQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsRUFBRSxVQUFBLE1BQU0sRUFBQyxTQUFHLE1BQU0sS0FBSyxTQUFTLEdBQUEsQ0FBQyxDQUFDO0dBQ25HO0NBQ0YsQ0FBQTs7Ozs7QUFLSCx3QkFBRSx3QkFBd0Isc0NBQUMsU0FBUyxFQUFFLElBQUksRUFBRTtFQUMxQyxJQUFRLGdCQUFnQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7RUFDbkUsSUFBUSxXQUFXLEdBQUcsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDOztFQUU3RCxJQUFNLGdCQUFnQixJQUFJLFdBQVcsS0FBSyxJQUFJLEVBQUU7SUFDOUMsZ0JBQWtCLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQyxXQUFXLEVBQUUsVUFBQSxNQUFNLEVBQUMsU0FBRyxNQUFNLEtBQUssU0FBUyxHQUFBLENBQUMsQ0FBQztHQUM5RjtDQUNGLENBQUE7O0FBR0gsb0JBQWUsSUFBSSxhQUFhLEVBQUUsQ0FBQzs7QUNuSm5DOzs7QUFHQUQsSUFBTSxLQUFLLEdBQUc7RUFDWixZQUFZLEVBQUUsSUFBSTtFQUNsQixnQkFBZ0IsRUFBRSxJQUFJO0VBQ3RCLG9CQUFvQixFQUFFLElBQUk7RUFDMUIsaUJBQWlCLEVBQUUsSUFBSTtFQUN2QixlQUFlLEVBQUUsSUFBSTtFQUNyQixjQUFjLEVBQUUsSUFBSTtFQUNwQixlQUFlLEVBQUUsSUFBSTtDQUN0QixDQUFDLEFBRUYsQUFBcUI7O0FDYk4sU0FBUyxZQUFZLENBQUMsR0FBRyxFQUFFO0VBQ3hDQSxJQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0VBQy9CLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUcsR0FBTSxNQUFFLElBQUksR0FBRyxDQUFDO0NBQ25FOztBQ0hjLFNBQVMsR0FBRyxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUU7O0VBRTNDLElBQUksT0FBTyxPQUFPLEtBQUssV0FBVyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxLQUFLLE1BQU0sRUFBRTtJQUNyRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztHQUNyQzs7Q0FFRjs7QUNOYyxJQUFNLGNBQWMsR0FBQzs7QUFBQSx5QkFFbEMsZUFBZSwrQkFBRyxFQUFFLENBQUE7QUFDdEIseUJBQUUsd0JBQXdCLHdDQUFHLEVBQUUsQ0FBQTs7OztBQUkvQix5QkFBRSxTQUFTLHVCQUFDLElBQWtCLEVBQUUsT0FBZSxFQUFFLFVBQWtCLEVBQUU7K0JBQXJELEdBQUcsV0FBVyxDQUFTO3FDQUFBLEdBQUcsS0FBSyxDQUFZOzJDQUFBLEdBQUcsS0FBSzs7RUFDakUsSUFBTSxDQUFDLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7RUFDM0IsSUFBTSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7RUFDbEMsSUFBTSxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7Q0FDdkMsQ0FBQSxBQUNGOztBQ1ZELElBQXFCLEtBQUs7RUFBd0IsY0FDckMsQ0FBQyxJQUFJLEVBQUUsZUFBb0IsRUFBRTtxREFBUCxHQUFHLEVBQUU7O0lBQ3BDRSxpQkFBSyxLQUFBLENBQUMsSUFBQSxDQUFDLENBQUM7O0lBRVIsSUFBSSxDQUFDLElBQUksRUFBRTtNQUNULE1BQU0sSUFBSSxTQUFTLENBQUMsdUVBQXVFLENBQUMsQ0FBQztLQUM5Rjs7SUFFRCxJQUFJLE9BQU8sZUFBZSxLQUFLLFFBQVEsRUFBRTtNQUN2QyxNQUFNLElBQUksU0FBUyxDQUFDLDZFQUE2RSxDQUFDLENBQUM7S0FDcEc7O0lBRUQsSUFBUSxPQUFPO0lBQUUsSUFBQSxVQUFVLDhCQUFyQjs7SUFFTixJQUFJLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN6QixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUM1QixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztJQUNuQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztJQUN2QixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztJQUN4QixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztJQUN2QixJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQztJQUNwQixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO0lBQzlCLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO0lBQzFCLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxLQUFLLENBQUM7SUFDM0QsSUFBSSxDQUFDLGFBQWEsR0FBRyxLQUFLLENBQUM7SUFDM0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEtBQUssQ0FBQztHQUNuRDs7OztzQ0FBQTs7O0VBMUJnQyxjQTJCbEMsR0FBQTs7QUMzQkQsSUFBcUIsWUFBWTtFQUF3QixxQkFDNUMsQ0FBQyxJQUFJLEVBQUUsZUFBb0IsRUFBRTtxREFBUCxHQUFHLEVBQUU7O0lBQ3BDQSxpQkFBSyxLQUFBLENBQUMsSUFBQSxDQUFDLENBQUM7O0lBRVIsSUFBSSxDQUFDLElBQUksRUFBRTtNQUNULE1BQU0sSUFBSSxTQUFTLENBQUMsOEVBQThFLENBQUMsQ0FBQztLQUNyRzs7SUFFRCxJQUFJLE9BQU8sZUFBZSxLQUFLLFFBQVEsRUFBRTtNQUN2QyxNQUFNLElBQUksU0FBUyxDQUFDLG9GQUFvRixDQUFDLENBQUM7S0FDM0c7O0lBRUQsSUFBUSxPQUFPO0lBQUUsSUFBQSxVQUFVO0lBQUUsSUFBQSxJQUFJO0lBQUUsSUFBQSxNQUFNO0lBQUUsSUFBQSxXQUFXO0lBQUUsSUFBQSxLQUFLLHlCQUF2RDs7SUFFTixJQUFJLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN6QixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUM1QixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztJQUNuQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztJQUN2QixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztJQUN4QixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztJQUN2QixJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQztJQUNwQixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO0lBQzlCLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO0lBQzFCLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxLQUFLLENBQUM7SUFDM0QsSUFBSSxDQUFDLGFBQWEsR0FBRyxLQUFLLENBQUM7SUFDM0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEtBQUssQ0FBQztJQUNsRCxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQzNDLElBQUksQ0FBQyxLQUFLLEdBQUcsT0FBTyxLQUFLLEtBQUssV0FBVyxHQUFHLElBQUksR0FBRyxLQUFLLENBQUM7SUFDekQsSUFBSSxDQUFDLElBQUksR0FBRyxPQUFPLElBQUksS0FBSyxXQUFXLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztJQUN0RCxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxDQUFDO0dBQzNEOzs7O29EQUFBOzs7RUE5QnVDLGNBK0J6QyxHQUFBOztBQy9CRCxJQUFxQixVQUFVO0VBQXdCLG1CQUMxQyxDQUFDLElBQUksRUFBRSxlQUFvQixFQUFFO3FEQUFQLEdBQUcsRUFBRTs7SUFDcENBLGlCQUFLLEtBQUEsQ0FBQyxJQUFBLENBQUMsQ0FBQzs7SUFFUixJQUFJLENBQUMsSUFBSSxFQUFFO01BQ1QsTUFBTSxJQUFJLFNBQVMsQ0FBQyw0RUFBNEUsQ0FBQyxDQUFDO0tBQ25HOztJQUVELElBQUksT0FBTyxlQUFlLEtBQUssUUFBUSxFQUFFO01BQ3ZDLE1BQU0sSUFBSSxTQUFTLENBQUMsa0ZBQWtGLENBQUMsQ0FBQztLQUN6Rzs7SUFFRCxJQUFRLE9BQU87SUFBRSxJQUFBLFVBQVU7SUFBRSxJQUFBLElBQUk7SUFBRSxJQUFBLE1BQU07SUFBRSxJQUFBLFFBQVEsNEJBQTdDOztJQUVOLElBQUksQ0FBQyxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3pCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQzVCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO0lBQ25CLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDO0lBQ3ZCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO0lBQ3hCLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO0lBQ3ZCLElBQUksQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDO0lBQ3BCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7SUFDOUIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7SUFDMUIsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxHQUFHLEtBQUssQ0FBQztJQUMzRCxJQUFJLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQztJQUMzQixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsS0FBSyxDQUFDO0lBQ2xELElBQUksQ0FBQyxJQUFJLEdBQUcsT0FBTyxJQUFJLEtBQUssUUFBUSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDeEQsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUMzQyxJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsS0FBSyxDQUFDO0dBQ3REOzs7O2dEQUFBOzs7RUE3QnFDLGNBOEJ2QyxHQUFBOzs7Ozs7OztBQ3RCRCxTQUFTLFdBQVcsQ0FBQyxNQUFNLEVBQUU7RUFDM0IsSUFBUSxJQUFJO0VBQUUsSUFBQSxNQUFNLGlCQUFkO0VBQ05GLElBQU0sV0FBVyxHQUFHLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDOztFQUVwQyxJQUFJLE1BQU0sRUFBRTtJQUNWLFdBQVcsQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQzVCLFdBQVcsQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDO0lBQ2hDLFdBQVcsQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDO0dBQ3BDOztFQUVELE9BQU8sV0FBVyxDQUFDO0NBQ3BCOzs7Ozs7OztBQVFELFNBQVMsa0JBQWtCLENBQUMsTUFBTSxFQUFFO0VBQ2xDLElBQVEsSUFBSTtFQUFFLElBQUEsTUFBTTtFQUFFLElBQUEsSUFBSTtFQUFFLElBQUEsTUFBTSxpQkFBNUI7RUFDTkEsSUFBTSxZQUFZLEdBQUcsSUFBSSxZQUFZLENBQUMsSUFBSSxFQUFFO0lBQzFDLE1BQUEsSUFBSTtJQUNKLFFBQUEsTUFBTTtHQUNQLENBQUMsQ0FBQzs7RUFFSCxJQUFJLE1BQU0sRUFBRTtJQUNWLFlBQVksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQzdCLFlBQVksQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDO0lBQ2pDLFlBQVksQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDO0dBQ3JDOztFQUVELE9BQU8sWUFBWSxDQUFDO0NBQ3JCOzs7Ozs7OztBQVFELFNBQVMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFO0VBQ2hDLElBQVEsSUFBSTtFQUFFLElBQUEsTUFBTTtFQUFFLElBQUEsSUFBSTtFQUFFLElBQUEsTUFBTSxpQkFBNUI7RUFDTixJQUFNLFFBQVEsbUJBQVY7O0VBRUosSUFBSSxDQUFDLFFBQVEsRUFBRTtJQUNiLFFBQVEsR0FBRyxJQUFJLEtBQUssSUFBSSxDQUFDO0dBQzFCOztFQUVEQSxJQUFNLFVBQVUsR0FBRyxJQUFJLFVBQVUsQ0FBQyxJQUFJLEVBQUU7SUFDdEMsTUFBQSxJQUFJO0lBQ0osUUFBQSxNQUFNO0lBQ04sVUFBQSxRQUFRO0dBQ1QsQ0FBQyxDQUFDOztFQUVILElBQUksTUFBTSxFQUFFO0lBQ1YsVUFBVSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7SUFDM0IsVUFBVSxDQUFDLFVBQVUsR0FBRyxNQUFNLENBQUM7SUFDL0IsVUFBVSxDQUFDLGFBQWEsR0FBRyxNQUFNLENBQUM7R0FDbkM7O0VBRUQsT0FBTyxVQUFVLENBQUM7Q0FDbkIsQUFFRCxBQUE2RDs7Ozs7Ozs7QUM1RDdELElBQU1HLFdBQVM7RUFBcUIsa0JBSXZCLENBQUMsR0FBRyxFQUFFLFFBQWEsRUFBRTt1Q0FBUCxHQUFHLEVBQUU7O0lBQzVCRCxjQUFLLEtBQUEsQ0FBQyxJQUFBLENBQUMsQ0FBQzs7SUFFUixJQUFJLENBQUMsR0FBRyxFQUFFO01BQ1IsTUFBTSxJQUFJLFNBQVMsQ0FBQywyRUFBMkUsQ0FBQyxDQUFDO0tBQ2xHOztJQUVELElBQUksQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDO0lBQ3pCLElBQUksQ0FBQyxHQUFHLEdBQUdFLFlBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUMxQixJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUM7SUFDdkMsSUFBSSxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7O0lBRW5CLElBQUksT0FBTyxRQUFRLEtBQUssUUFBUSxFQUFFO01BQ2hDLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO0tBQzFCLE1BQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO01BQ3pELElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQzdCOzs7Ozs7Ozs7O0lBVUQsTUFBTSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRTtNQUM1QixNQUFNLEVBQUU7UUFDTixZQUFZLEVBQUUsSUFBSTtRQUNsQixVQUFVLEVBQUUsSUFBSTtRQUNoQixHQUFHLGNBQUEsR0FBRztVQUNKLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUM7U0FDNUI7UUFDRCxHQUFHLGNBQUEsQ0FBQyxRQUFRLEVBQUU7VUFDWixJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1NBQ3pDO09BQ0Y7TUFDRCxTQUFTLEVBQUU7UUFDVCxZQUFZLEVBQUUsSUFBSTtRQUNsQixVQUFVLEVBQUUsSUFBSTtRQUNoQixHQUFHLGNBQUEsR0FBRztVQUNKLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUM7U0FDL0I7UUFDRCxHQUFHLGNBQUEsQ0FBQyxRQUFRLEVBQUU7VUFDWixJQUFJLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1NBQzVDO09BQ0Y7TUFDRCxPQUFPLEVBQUU7UUFDUCxZQUFZLEVBQUUsSUFBSTtRQUNsQixVQUFVLEVBQUUsSUFBSTtRQUNoQixHQUFHLGNBQUEsR0FBRztVQUNKLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUM7U0FDN0I7UUFDRCxHQUFHLGNBQUEsQ0FBQyxRQUFRLEVBQUU7VUFDWixJQUFJLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1NBQzFDO09BQ0Y7TUFDRCxPQUFPLEVBQUU7UUFDUCxZQUFZLEVBQUUsSUFBSTtRQUNsQixVQUFVLEVBQUUsSUFBSTtRQUNoQixHQUFHLGNBQUEsR0FBRztVQUNKLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUM7U0FDN0I7UUFDRCxHQUFHLGNBQUEsQ0FBQyxRQUFRLEVBQUU7VUFDWixJQUFJLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1NBQzFDO09BQ0Y7S0FDRixDQUFDLENBQUM7OztJQUdISixJQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7SUFnQjdELEtBQUssQ0FBQyxTQUFTLGFBQWEsR0FBRztNQUM3QixJQUFJLE1BQU0sRUFBRTtRQUNWO1VBQ0UsTUFBTSxDQUFDLE9BQU8sQ0FBQyxZQUFZO1VBQzNCLE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEtBQUssVUFBVTtVQUNqRCxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFO1VBQzlCO1VBQ0EsSUFBSSxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFDOztVQUVuQ0ssR0FBTTtZQUNKLE9BQU87YUFDUCwyQkFBMEIsSUFBRSxJQUFJLENBQUMsR0FBRyxDQUFBLHlFQUFxRTtXQUMxRyxDQUFDOztVQUVGLGFBQWEsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztVQUM5QyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztVQUNqRSxJQUFJLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRUMsS0FBVyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQztTQUN2RyxNQUFNO1VBQ0wsSUFBSSxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDO1VBQ2pDLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1VBQ2hFLE1BQU0sQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1NBQ3pFO09BQ0YsTUFBTTtRQUNMLElBQUksQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQztRQUNuQyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRUEsS0FBVyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQzs7UUFFdEdELEdBQU0sQ0FBQyxPQUFPLEdBQUUsMkJBQTBCLElBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQSxhQUFTLEVBQUUsQ0FBQztPQUNqRTtLQUNGLEVBQUUsSUFBSSxDQUFDLENBQUM7R0FDVjs7Ozs4Q0FBQTs7Ozs7OztFQU9ELG9CQUFBLElBQUksa0JBQUMsSUFBSSxFQUFFO0lBQ1QsSUFBSSxJQUFJLENBQUMsVUFBVSxLQUFLLFNBQVMsQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLFVBQVUsS0FBSyxTQUFTLENBQUMsTUFBTSxFQUFFO01BQ2pGLE1BQU0sSUFBSSxLQUFLLENBQUMsaURBQWlELENBQUMsQ0FBQztLQUNwRTs7SUFFREwsSUFBTSxZQUFZLEdBQUcsa0JBQWtCLENBQUM7TUFDdEMsSUFBSSxFQUFFLFNBQVM7TUFDZixNQUFNLEVBQUUsSUFBSSxDQUFDLEdBQUc7TUFDaEIsTUFBQSxJQUFJO0tBQ0wsQ0FBQyxDQUFDOztJQUVIQSxJQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQzs7SUFFcEQsSUFBSSxNQUFNLEVBQUU7TUFDVixLQUFLLENBQUMsWUFBRztRQUNQLE1BQU0sQ0FBQyxhQUFhLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO09BQzFDLEVBQUUsTUFBTSxDQUFDLENBQUM7S0FDWjtHQUNGLENBQUE7Ozs7Ozs7O0VBUUQsb0JBQUEsS0FBSyxxQkFBRztJQUNOLElBQUksSUFBSSxDQUFDLFVBQVUsS0FBSyxTQUFTLENBQUMsSUFBSSxFQUFFO01BQ3RDLE9BQU8sU0FBUyxDQUFDO0tBQ2xCOztJQUVEQSxJQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNwREEsSUFBTSxVQUFVLEdBQUcsZ0JBQWdCLENBQUM7TUFDbEMsSUFBSSxFQUFFLE9BQU87TUFDYixNQUFNLEVBQUUsSUFBSTtNQUNaLElBQUksRUFBRU0sS0FBVyxDQUFDLFlBQVk7S0FDL0IsQ0FBQyxDQUFDOztJQUVILGFBQWEsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQzs7SUFFOUMsSUFBSSxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFDO0lBQ25DLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7O0lBRS9CLElBQUksTUFBTSxFQUFFO01BQ1YsTUFBTSxDQUFDLGFBQWEsQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7S0FDMUM7R0FDRixDQUFBOzs7RUE3S3FCLFdBOEt2QixHQUFBOztBQUVESCxXQUFTLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQztBQUN6QkEsV0FBUyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7QUFDbkJBLFdBQVMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDO0FBQ3RCQSxXQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxBQUVyQixBQUF5Qjs7QUNuTVYsU0FBUyxvQkFBb0IsR0FBRztFQUM3QyxJQUFJLE9BQU8sTUFBTSxLQUFLLFdBQVcsRUFBRTtJQUNqQyxPQUFPLE1BQU0sQ0FBQztHQUNmOztFQUVELE9BQU8sT0FBTyxPQUFPLEtBQUssUUFBUSxJQUFJLE9BQU8sT0FBTyxLQUFLLFVBQVUsSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQztDQUNuSDs7QUNORCxhQUFlLFVBQUEsR0FBRyxFQUFDLFNBQ2pCLEdBQUcsQ0FBQyxNQUFNLENBQUMsVUFBQyxPQUFPLEVBQUUsQ0FBQyxFQUFFO0lBQ3RCLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFBLE9BQU8sT0FBTyxDQUFDLEVBQUE7SUFDNUMsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0dBQzFCLEVBQUUsRUFBRSxDQUFDLEdBQUEsQ0FBQSxBQUFDOzs7OztBQ1FULElBQU1JLFFBQU07RUFBcUIsZUFJcEIsQ0FBQyxHQUFHLEVBQUUsT0FBWSxFQUFFO3FDQUFQLEdBQUcsRUFBRTs7SUFDM0JMLGNBQUssS0FBQSxDQUFDLElBQUEsQ0FBQyxDQUFDO0lBQ1IsSUFBSSxDQUFDLEdBQUcsR0FBR0UsWUFBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzFCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7SUFDOUJKLElBQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQzs7SUFFMUQsSUFBSSxDQUFDLE1BQU0sRUFBRTtNQUNYLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztNQUNuRCxNQUFNLElBQUksS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7S0FDbkU7O0lBRUQsSUFBSSxPQUFPLE9BQU8sQ0FBQyxZQUFZLEtBQUssV0FBVyxFQUFFO01BQy9DLE9BQU8sQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO0tBQzdCOztJQUVELElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDOztJQUV2QixJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7R0FDZDs7Ozt3Q0FBQTs7Ozs7RUFLRCxpQkFBQSxLQUFLLHFCQUFHO0lBQ05BLElBQU0sU0FBUyxHQUFHUSxvQkFBWSxFQUFFLENBQUM7O0lBRWpDLElBQUksU0FBUyxDQUFDLFNBQVMsRUFBRTtNQUN2QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQztLQUM5Qzs7SUFFRCxTQUFTLENBQUMsU0FBUyxHQUFHTCxXQUFTLENBQUM7R0FDakMsQ0FBQTs7Ozs7RUFLRCxpQkFBQSxJQUFJLGtCQUFDLFFBQW1CLEVBQUU7dUNBQWIsR0FBRyxZQUFHLEVBQUs7O0lBQ3RCSCxJQUFNLFNBQVMsR0FBR1Esb0JBQVksRUFBRSxDQUFDOztJQUVqQyxJQUFJLElBQUksQ0FBQyxpQkFBaUIsRUFBRTtNQUMxQixTQUFTLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztLQUM5QyxNQUFNO01BQ0wsT0FBTyxTQUFTLENBQUMsU0FBUyxDQUFDO0tBQzVCOztJQUVELElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7O0lBRTlCLGFBQWEsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDOztJQUVyQyxJQUFJLE9BQU8sUUFBUSxLQUFLLFVBQVUsRUFBRTtNQUNsQyxRQUFRLEVBQUUsQ0FBQztLQUNaO0dBQ0YsQ0FBQTs7Ozs7Ozs7OztFQVVELGlCQUFBLEVBQUUsZ0JBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRTtJQUNqQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0dBQ3ZDLENBQUE7Ozs7Ozs7O0VBUUQsaUJBQUEsSUFBSSxrQkFBQyxJQUFJLEVBQUUsT0FBWSxFQUFFO3FDQUFQLEdBQUcsRUFBRTs7SUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0dBQ3JDLENBQUE7Ozs7O0VBS0QsaUJBQUEsSUFBSSxrQkFBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLE9BQVksRUFBRTtzQkFBUDtxQ0FBQSxHQUFHLEVBQUU7O0lBQzVCLElBQU0sVUFBVSxzQkFBWjs7SUFFSixJQUFJLENBQUMsVUFBVSxFQUFFO01BQ2YsVUFBVSxHQUFHLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7S0FDdkQ7O0lBRUQsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLElBQUksU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7TUFDdkQsSUFBSSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztLQUNuRTs7SUFFRCxVQUFVLENBQUMsT0FBTyxDQUFDLFVBQUEsTUFBTSxFQUFDO01BQ3hCLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUN2QixNQUFNLENBQUMsYUFBYSxNQUFBO1VBQ2xCLFVBQUEsa0JBQWtCLENBQUM7WUFDakIsSUFBSSxFQUFFLEtBQUs7WUFDWCxNQUFBLElBQUk7WUFDSixNQUFNLEVBQUVQLE1BQUksQ0FBQyxHQUFHO1lBQ2hCLE1BQU0sRUFBRSxNQUFNO1dBQ2YsQ0FBQyxXQUNGLElBQU8sRUFBQTtTQUNSLENBQUM7T0FDSCxNQUFNO1FBQ0wsTUFBTSxDQUFDLGFBQWE7VUFDbEIsa0JBQWtCLENBQUM7WUFDakIsSUFBSSxFQUFFLEtBQUs7WUFDWCxNQUFBLElBQUk7WUFDSixNQUFNLEVBQUVBLE1BQUksQ0FBQyxHQUFHO1lBQ2hCLE1BQU0sRUFBRSxNQUFNO1dBQ2YsQ0FBQztTQUNILENBQUM7T0FDSDtLQUNGLENBQUMsQ0FBQztHQUNKLENBQUE7Ozs7Ozs7OztFQVNELGlCQUFBLEtBQUssbUJBQUMsT0FBWSxFQUFFO3FDQUFQLEdBQUcsRUFBRTs7SUFDaEIsSUFBUSxJQUFJO0lBQUUsSUFBQSxNQUFNO0lBQUUsSUFBQSxRQUFRLG9CQUF4QjtJQUNORCxJQUFNLFNBQVMsR0FBRyxhQUFhLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDOzs7O0lBSTNELGFBQWEsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDOztJQUVyQyxTQUFTLENBQUMsT0FBTyxDQUFDLFVBQUEsTUFBTSxFQUFDO01BQ3ZCLE1BQU0sQ0FBQyxVQUFVLEdBQUdHLFdBQVMsQ0FBQyxLQUFLLENBQUM7TUFDcEMsTUFBTSxDQUFDLGFBQWE7UUFDbEIsZ0JBQWdCLENBQUM7VUFDZixJQUFJLEVBQUUsT0FBTztVQUNiLE1BQU0sRUFBRSxNQUFNO1VBQ2QsSUFBSSxFQUFFLElBQUksSUFBSUcsS0FBVyxDQUFDLFlBQVk7VUFDdEMsTUFBTSxFQUFFLE1BQU0sSUFBSSxFQUFFO1VBQ3BCLFVBQUEsUUFBUTtTQUNULENBQUM7T0FDSCxDQUFDO0tBQ0gsQ0FBQyxDQUFDOztJQUVILElBQUksQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztHQUMvRCxDQUFBOzs7OztFQUtELGlCQUFBLE9BQU8sdUJBQUc7SUFDUixPQUFPLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7R0FDakQsQ0FBQTs7Ozs7OztFQU9ELGlCQUFBLEVBQUUsZ0JBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRSxhQUFrQixFQUFFO3NCQUFQO2lEQUFBLEdBQUcsRUFBRTs7SUFDdENOLElBQU0sSUFBSSxHQUFHLElBQUksQ0FBQztJQUNsQkEsSUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQzs7SUFFN0csT0FBTztNQUNMLEVBQUUsRUFBRSxVQUFDLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxTQUFHQyxNQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQ0EsTUFBSSxFQUFFLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLENBQUMsR0FBQTtNQUN4RyxJQUFJLGVBQUEsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQ2hCLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFLFlBQUEsVUFBVSxFQUFFLENBQUMsQ0FBQztPQUN4QztLQUNGLENBQUM7R0FDSCxDQUFBOzs7OztFQUtELGlCQUFBLEVBQUUsb0JBQVU7Ozs7SUFDVixPQUFPLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztHQUNsQyxDQUFBOzs7RUFsTGtCLFdBbUxwQixHQUFBOzs7Ozs7O0FBT0RNLFFBQU0sQ0FBQyxFQUFFLEdBQUcsU0FBUyxFQUFFLENBQUMsR0FBRyxFQUFFO0VBQzNCLE9BQU8sSUFBSUEsUUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0NBQ3hCLENBQUMsQUFFRixBQUFzQjs7Ozs7OztBQzdMdEIsSUFBTUUsVUFBUTtFQUFxQixpQkFJdEIsQ0FBQyxHQUFpQixFQUFFLFFBQWEsRUFBRTtzQkFBL0I7NkJBQUEsR0FBRyxXQUFXLENBQVU7dUNBQUEsR0FBRyxFQUFFOztJQUMxQ1AsY0FBSyxLQUFBLENBQUMsSUFBQSxDQUFDLENBQUM7O0lBRVIsSUFBSSxDQUFDLFVBQVUsR0FBRyxNQUFNLENBQUM7SUFDekIsSUFBSSxDQUFDLEdBQUcsR0FBR0UsWUFBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzFCLElBQUksQ0FBQyxVQUFVLEdBQUcsUUFBUSxDQUFDLFVBQVUsQ0FBQztJQUN0QyxJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQzs7SUFFbkIsSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRLEVBQUU7TUFDaEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7S0FDMUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7TUFDekQsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDN0I7O0lBRURKLElBQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQzs7Ozs7SUFLN0QsS0FBSyxDQUFDLFNBQVMsYUFBYSxHQUFHO01BQzdCLElBQUksTUFBTSxFQUFFO1FBQ1YsSUFBSSxDQUFDLFVBQVUsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDO1FBQ2hDLE1BQU0sQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO09BQ3BFLE1BQU07UUFDTCxJQUFJLENBQUMsVUFBVSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUM7UUFDbEMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsSUFBSSxDQUFDLGFBQWE7VUFDaEIsZ0JBQWdCLENBQUM7WUFDZixJQUFJLEVBQUUsT0FBTztZQUNiLE1BQU0sRUFBRSxJQUFJO1lBQ1osSUFBSSxFQUFFTSxLQUFXLENBQUMsWUFBWTtXQUMvQixDQUFDO1NBQ0gsQ0FBQzs7UUFFRkQsR0FBTSxDQUFDLE9BQU8sR0FBRSwyQkFBMEIsSUFBRSxJQUFJLENBQUMsR0FBRyxDQUFBLGFBQVMsRUFBRSxDQUFDO09BQ2pFO0tBQ0YsRUFBRSxJQUFJLENBQUMsQ0FBQzs7Ozs7SUFLVCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLFVBQUEsS0FBSyxFQUFDO01BQ25DSixNQUFJLENBQUMsYUFBYTtRQUNoQixnQkFBZ0IsQ0FBQztVQUNmLElBQUksRUFBRSxZQUFZO1VBQ2xCLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTTtVQUNwQixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7U0FDakIsQ0FBQztPQUNILENBQUM7S0FDSCxDQUFDLENBQUM7R0FDSjs7Ozs7OzZDQUFBOzs7Ozs7RUFNRCxtQkFBQSxLQUFLLHFCQUFHO0lBQ04sSUFBSSxJQUFJLENBQUMsVUFBVSxLQUFLLFFBQVEsQ0FBQyxJQUFJLEVBQUU7TUFDckMsT0FBTyxTQUFTLENBQUM7S0FDbEI7O0lBRURELElBQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3BELGFBQWEsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQzs7SUFFOUMsSUFBSSxDQUFDLFVBQVUsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO0lBQ2xDLElBQUksQ0FBQyxhQUFhO01BQ2hCLGdCQUFnQixDQUFDO1FBQ2YsSUFBSSxFQUFFLE9BQU87UUFDYixNQUFNLEVBQUUsSUFBSTtRQUNaLElBQUksRUFBRU0sS0FBVyxDQUFDLFlBQVk7T0FDL0IsQ0FBQztLQUNILENBQUM7O0lBRUYsSUFBSSxNQUFNLEVBQUU7TUFDVixNQUFNLENBQUMsYUFBYTtRQUNsQixnQkFBZ0IsQ0FBQztVQUNmLElBQUksRUFBRSxZQUFZO1VBQ2xCLE1BQU0sRUFBRSxJQUFJO1VBQ1osSUFBSSxFQUFFQSxLQUFXLENBQUMsWUFBWTtTQUMvQixDQUFDO1FBQ0YsTUFBTTtPQUNQLENBQUM7S0FDSDtHQUNGLENBQUE7Ozs7Ozs7RUFPRCxtQkFBQSxVQUFVLDBCQUFHO0lBQ1gsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO0dBQ2QsQ0FBQTs7Ozs7RUFLRCxtQkFBQSxJQUFJLGtCQUFDLEtBQUssRUFBVzs7OztJQUNuQixJQUFJLElBQUksQ0FBQyxVQUFVLEtBQUssUUFBUSxDQUFDLElBQUksRUFBRTtNQUNyQyxNQUFNLElBQUksS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7S0FDbkU7O0lBRUROLElBQU0sWUFBWSxHQUFHLGtCQUFrQixDQUFDO01BQ3RDLElBQUksRUFBRSxLQUFLO01BQ1gsTUFBTSxFQUFFLElBQUksQ0FBQyxHQUFHO01BQ2hCLE1BQUEsSUFBSTtLQUNMLENBQUMsQ0FBQzs7SUFFSEEsSUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7O0lBRXBELElBQUksTUFBTSxFQUFFO01BQ1YsTUFBTSxDQUFDLGFBQWEsTUFBQSxDQUFDLFVBQUEsWUFBWSxXQUFFLElBQU8sRUFBQSxDQUFDLENBQUM7S0FDN0M7R0FDRixDQUFBOzs7Ozs7Ozs7RUFTRCxtQkFBQSxJQUFJLGtCQUFDLElBQUksRUFBRTtJQUNULElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO0dBQzVCLENBQUE7Ozs7Ozs7O0VBUUQsbUJBQUEsU0FBYSxtQkFBRztJQUNkLElBQUksSUFBSSxDQUFDLFVBQVUsS0FBSyxRQUFRLENBQUMsSUFBSSxFQUFFO01BQ3JDLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0RBQWdELENBQUMsQ0FBQztLQUNuRTs7SUFFREEsSUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQ2xCQSxJQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNwRCxJQUFJLENBQUMsTUFBTSxFQUFFO01BQ1gsTUFBTSxJQUFJLEtBQUssRUFBQyx1REFBc0QsSUFBRSxJQUFJLENBQUMsR0FBRyxDQUFBLE1BQUUsRUFBRSxDQUFDO0tBQ3RGOztJQUVELE9BQU87TUFDTCxJQUFJLGVBQUEsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQ2hCLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFLFVBQVUsRUFBRSxhQUFhLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO09BQ2hHO01BQ0QsRUFBRSxhQUFBLENBQUMsSUFBSSxFQUFFO1FBQ1AsT0FBTyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztPQUM5QjtNQUNELEVBQUUsZUFBQSxDQUFDLElBQUksRUFBRTtRQUNQLE9BQU8sTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7T0FDOUI7S0FDRixDQUFDO0dBQ0gsQ0FBQTs7Ozs7RUFLRCxtQkFBQSxFQUFFLGdCQUFDLElBQUksRUFBRSxRQUFRLEVBQUU7SUFDakIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztHQUN2QyxDQUFBOzs7Ozs7O0VBT0QsbUJBQUEsR0FBRyxpQkFBQyxJQUFJLEVBQUU7SUFDUixJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUM7R0FDaEMsQ0FBQTs7Ozs7OztFQU9ELG1CQUFBLElBQUksa0JBQUMsSUFBSSxFQUFFO0lBQ1QsYUFBYSxDQUFDLG1CQUFtQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztHQUMvQyxDQUFBOzs7Ozs7O0VBT0QsbUJBQUEsS0FBSyxtQkFBQyxJQUFJLEVBQUU7SUFDVixhQUFhLENBQUMsd0JBQXdCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0dBQ3BELENBQUE7O0VBRUQsbUJBQUEsRUFBRSxnQkFBQyxJQUFJLEVBQUU7SUFDUCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO0dBQ2hDLENBQUE7O0VBRUQsbUJBQUEsRUFBRSxvQkFBRztJQUNILE9BQU8sSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0dBQ3ZDLENBQUE7Ozs7Ozs7O0VBUUQsbUJBQUEsYUFBYSwyQkFBQyxLQUFLLEVBQXNCOzs7OztJQUN2Q0EsSUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztJQUM3QkEsSUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQzs7SUFFNUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUU7TUFDN0IsT0FBTyxLQUFLLENBQUM7S0FDZDs7SUFFRCxTQUFTLENBQUMsT0FBTyxDQUFDLFVBQUEsUUFBUSxFQUFDO01BQ3pCLElBQUksZUFBZSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDOUIsUUFBUSxDQUFDLEtBQUssQ0FBQ0MsTUFBSSxFQUFFLGVBQWUsQ0FBQyxDQUFDO09BQ3ZDLE1BQU07Ozs7UUFJTCxRQUFRLENBQUMsSUFBSSxDQUFDQSxNQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDO09BQ3REO0tBQ0YsQ0FBQyxDQUFDO0dBQ0osQ0FBQTs7Ozs7RUFwT29CLFdBcU90QixHQUFBOztBQUVEUSxVQUFRLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQztBQUN4QkEsVUFBUSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7QUFDbEJBLFVBQVEsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDO0FBQ3JCQSxVQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQzs7Ozs7QUFLcEJULElBQU0sRUFBRSxHQUFHLFNBQVMsYUFBYSxDQUFDLEdBQUcsRUFBRTtFQUNyQyxPQUFPLElBQUlTLFVBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztDQUMxQixDQUFDOzs7OztBQUtGLEVBQUUsQ0FBQyxPQUFPLEdBQUcsU0FBUyxTQUFTLENBQUMsR0FBRyxFQUFFOztFQUVuQyxPQUFPLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQzs7Q0FFaEIsQ0FBQyxBQUVGLEFBQWtCOztBQ3JRWFQsSUFBTSxNQUFNLEdBQUdVLFFBQVUsQ0FBQztBQUNqQyxBQUFPVixJQUFNLFNBQVMsR0FBR1csV0FBYSxDQUFDO0FBQ3ZDLEFBQU9YLElBQU0sUUFBUSxHQUFHWSxFQUFZLENBQUM7Ozs7Ozs7OyJ9
