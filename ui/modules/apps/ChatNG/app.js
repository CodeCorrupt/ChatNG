const MAX_MESSAGE_LENGTH = 100;
const MAX_USERNAME_LENGTH = 25;
const RESET_THRESHOLD = 0.5;

let socket;

class LeakyBucket {
  constructor(capacity, leakRate, onChangeCallback) {
    this.capacity = capacity;
    this.leakRate = leakRate;
    this.onChangeCallback = onChangeCallback;
    this.water = 0;
    this._leakInterval = null;
    this.start();
  }

  fill(amount = this.capacity) {
    const prevValue = this.water;
    this.water = Math.min(this.water + amount, this.capacity);
    if (this.water !== prevValue) {
      this.onChangeCallback(prevValue, this.water, 0);
    }
  }

  // dt: time in seconds
  leak(dt = 1) {
    const prevValue = this.water;
    this.water = Math.max(this.water - this.leakRate * dt, 0);
    if (this.water !== prevValue) {
      this.onChangeCallback(prevValue, this.water, dt);
    }
  }

  value() {
    return this.water;
  }

  start(leakInterval = 100) {
    this.stop();
    this._leakInterval = setInterval(() => {
      this.leak(leakInterval / 1000);
    }, leakInterval);
  }

  stop() {
    if (this._leakInterval) {
      clearInterval(this._leakInterval);
      this._leakInterval = null;
    }
  }

  reset() {
    this.stop();
    if (this.water !== 0) {
      this.water = 0;
      this.onChangeCallback(this.water, 0, 0);
    }
    this.start();
  }
}


function trimString(str, length = 100, appendEllipsis = true, replaceNewlines = true) {
  let trimmedStr = str.trim().slice(0, length)
  if (trimmedStr.length === length && appendEllipsis) {
    trimmedStr += '...'
  }
  if (replaceNewlines) {
    trimmedStr = trimmedStr.replace(/\n/g, ' ')
  }
  return trimmedStr
}

angular.module('beamng.apps').directive('chatng', ['$http', '$interval', function ($http, $interval) {
  return {
    template: `
      <div class="twitch-chat-container">
        <div class="chat-messages">
          <div ng-repeat="message in messages track by $index" class="chat-message">
            <span class="username" ng-style="{'color': message.color}">{{message.username}}:</span>
            <span class="message-text">{{message.text}}</span>
          </div>
        </div>
        <input type="text" ng-model="channelName" placeholder="Enter Twitch channel name">
        <button ng-click="toggleTwitchConnection()">
          <div ng-if="!wssConnected">Connect</div>
          <div ng-if="wssConnected">Disconnect</div>
        </button>
        <button ng-click="toggleChatControlling()">
          <span ng-if="chatControlling">Stop</span>
          <span ng-if="!chatControlling">Start</span>
        </button>
        <div>
          <div><button ng-click="simChat('+')">Accelerate</button> {{pValue}}</div>
          <div><button ng-click="simChat('-')">Decelerate</button> {{mValue}}</div>
          <div><button ng-click="simChat('<')">Steer Left</button> {{lValue}}</div>
          <div><button ng-click="simChat('>')">Steer Right</button> {{rValue}}</div>
          <div><button ng-click="simChat('f')">Reset</button> {{resetValue}}</div>
        </div>
      </div>
    `,
    replace: true,
    restrict: 'EA',
    link: function (scope, element, attrs) {
      scope.messages = [];
      scope.channelName = '';
      scope.pValue = 0;
      scope.mValue = 0;
      scope.lValue = 0;
      scope.rValue = 0;
      scope.resetValue = 0;
      scope.wssConnected = false;
      scope.chatControlling = true;

      let usernameColorMap = {};
      let shouldReconnect = true;
      function onLeakyBucketOnChangeCallback(scopeName) {
        return function (oldValue, newValue, dt) {
          scope[scopeName] = newValue;
          applyOverrides();
        }
      }
      let controlLeakyBuckets = {
        accelerate: new LeakyBucket(1, 0.1, onLeakyBucketOnChangeCallback('pValue')),
        decelerate: new LeakyBucket(1, 0.1, onLeakyBucketOnChangeCallback('mValue')),
        steerLeft: new LeakyBucket(1, 0.1, onLeakyBucketOnChangeCallback('lValue')),
        steerRight: new LeakyBucket(1, 0.1, onLeakyBucketOnChangeCallback('rValue')),
        reset: new LeakyBucket(1, 0.1, onLeakyBucketOnChangeCallback('resetValue')),
      }

      scope.simChat = function (message) {
        processCommand({
          username: 'simulated',
          text: message,
          color: "#ffffff",
          isCmd: true,
        })
      }

      scope.toggleChatControlling = function () {
        scope.chatControlling = !scope.chatControlling;
      }

      scope.toggleTwitchConnection = function () {
        if (!scope.wssConnected) {
          if (scope.channelName) {
            connectWebsocket();
          } else {
            console.warn('Channel name is empty!');
          }
        } else {
          if (socket) {
            shouldReconnect = false;
            socket.close();
          }
        }
      };

      function connectWebsocket() {
        console.debug(`Websocket readyState: ${socket ? socket.readyState : 'null'}`);
        if (socket && socket.readyState === WebSocket.OPEN) {
          console.error('SOCKET ALREADY OPEN');
          return;
        }
        socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

        socket.onopen = function () {
          // No idea what's happening here with PASS AND NICK, but AI generated it and it works
          // Guessing public shared creds for read only?
          socket.send('PASS SCHMOOPIIE');
          socket.send('NICK justinfan12345');
          socket.send('JOIN #' + scope.channelName);
          console.info(`Connected to Twitch chat for channel: ${scope.channelName}`);
          console.log(`BEFORE scope.wssConnected: ${scope.wssConnected}`);
          scope.$apply(function () {
            scope.wssConnected = true;
          });
          shouldReconnect = true;
          console.log(`AFTER scope.wssConnected: ${scope.wssConnected}`);
        };

        socket.onclose = function () {
          console.warn(`Disconnected from Twitch chat for channel: ${scope.channelName}`);
          scope.$apply(function () {
            scope.wssConnected = false;
          });
          if (shouldReconnect)
            reconnectWebsocket();
        }

        socket.onerror = function (error) {
          console.error(`Error: ${error.message}`);
          socket.close();
        }

        socket.onmessage = function (event) {
          const message = event.data;
          const parts = message.split(' ');
          console.debug(`Received message: "${trimString(message)}"`);

          if (message.startsWith('PING')) {
            const rsp = 'PONG ' + parts[1]
            console.debug(`Responding to PING with: "${rsp}"`)
            socket.send(rsp)
          } else if (message.startsWith(':tmi.twitch.tv')) {
            console.info(`Ignoring server message`);
          } else if (parts[1].startsWith('JOIN')) {
            console.info(`Ignoring JOIN message`);
          } else if (parts[1].includes('PRIVMSG')) {
            const parsedMessage = parsePrivmsg(message);
            if (parsedMessage.isCmd) {
              console.debug(`Processing command: ${parsedMessage.text}`);
              processCommand(parsedMessage);
            } else {
              console.info(`Parsed message: ${JSON.stringify(parsedMessage)}`);
              scope.$apply(function () {
                scope.messages.push(parsedMessage);
                if (scope.messages.length > 5) {
                  scope.messages.shift();
                }
              });
            }
          } else {
            console.warn(`Unhandled message: ${message}`);
          }
        };
      }

      function reconnectWebsocket() {
        console.debug("Reconnecting websocket in 3 seconds...");
        setTimeout(() => {
          console.log('Reconnecting websocket');
          connectWebsocket();
        }, 3000);
      }

      function getColor(username) {
        if (!usernameColorMap[username]) {
          usernameColorMap[username] = '#' + Math.floor(Math.random() * 16777215).toString(16);
        }
        return usernameColorMap[username];
      }

      function parsePrivmsg(rawMessage) {
        const validCmds = ['+', '-', '<', '>', 'f'];
        const parts = rawMessage.split(' ');
        const parsedMsg = {
          username: parts[0].split('!')[0].substring(1).trim().slice(0, MAX_USERNAME_LENGTH),
          text: parts.slice(3).join(' ').substring(1).trim().slice(0, MAX_MESSAGE_LENGTH),
          color: "#ffffff",
          isCmd: false,
        }
        parsedMsg.color = getColor(parsedMsg.username)
        if (validCmds.includes(parsedMsg.text)) {
          parsedMsg.isCmd = true;
        }
        return parsedMsg;
      }

      function processCommand(parsedMessage) {
        switch (parsedMessage.text) {
          case '+':
            controlLeakyBuckets.accelerate.fill(0.3);
            break;
          case '-':
            controlLeakyBuckets.decelerate.fill(0.3);
            break;
          case '<':
            controlLeakyBuckets.steerLeft.fill(0.3);
            break;
          case '>':
            controlLeakyBuckets.steerRight.fill(0.3);
            break;
          case 'f':
            controlLeakyBuckets.reset.fill(0.3);
            break;
          default:
            console.warn(`Unrecognized command: ${parsedMessage.text}`);
        }
      }

      function sendValuesToVehicle(vehId, throttle, brake, steer, shouldReset) {
        bngApi.engineLua(
          `be:getPlayerVehicle(0):queueLuaCommand('extensions.ChatNG:setThrottle(${throttle})')`
        );
        bngApi.engineLua(
          `be:getPlayerVehicle(0):queueLuaCommand('extensions.ChatNG:setBrake(${brake})')`
        );
        bngApi.engineLua(
          `be:getPlayerVehicle(0):queueLuaCommand('extensions.ChatNG:setSteer(${steer})')`
        );
        if (shouldReset) {
          bngApi.engineLua(
            `be:getPlayerVehicle(0):queueLuaCommand('extensions.ChatNG:reset()')`
          );
        }
      }

      let needToClear = false;
      function applyOverrides() {
        if (!scope.chatControlling) {
          if (needToClear) {
            sendValuesToVehicle(0, 0, 0, 0, false);
            needToClear = false;
          }
          return;
        }
        needToClear = true;
        const shouldReset = controlLeakyBuckets.reset.value() > RESET_THRESHOLD;
        if (shouldReset) {
          controlLeakyBuckets.accelerate.reset();
          controlLeakyBuckets.decelerate.reset();
          controlLeakyBuckets.steerLeft.reset();
          controlLeakyBuckets.steerRight.reset();
          controlLeakyBuckets.reset.reset();
        }
        const desiredSteer = controlLeakyBuckets.steerRight.value() - controlLeakyBuckets.steerLeft.value();
        const desiredAccell = controlLeakyBuckets.accelerate.value() - controlLeakyBuckets.decelerate.value();
        const throttlePos = Math.min(1, Math.max(0, desiredAccell));
        const brakePos = Math.min(1, Math.max(0, -desiredAccell));
        const steerPos = Math.min(1, Math.max(-1, desiredSteer));
        sendValuesToVehicle(0, throttlePos, brakePos, steerPos, shouldReset);
      }


      element.ready(function () {
        scope.channelName = 'codecorrupt'
        connectWebsocket();
      });

      // Clean up on directive destroy
      scope.$on('$destroy', function () {
        if (socket) {
          socket.close();
        }
      });
    }
  };
}]);