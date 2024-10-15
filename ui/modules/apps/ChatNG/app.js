const MAX_MESSAGE_LENGTH = 100;
const MAX_USERNAME_LENGTH = 25;

class LeakyBucket {
  constructor(capacity, leakRate, updateCallback) {
    this.capacity = capacity;
    this.leakRate = leakRate;
    this.updateCallback = updateCallback;
    this.water = 0;
    this._leakInterval = null;
    this.start();
  }

  fill(amount = this.capacity) {
    const prevValue = this.water;
    this.water = Math.min(this.water + amount, this.capacity);
    if (this.water !== prevValue) {
      this.updateCallback(prevValue, this.water, 0);
    }
  }

  // dt: time in seconds
  leak(dt = 1) {
    const prevValue = this.water;
    this.water = Math.max(this.water - this.leakRate * dt, 0);
    if (this.water !== prevValue) {
      this.updateCallback(prevValue, this.water, dt);
    }
  }

  value() {
    return this.water;
  }

  isFull() {
    return this.water === this.capacity;
  }

  isEmpty() {
    return this.water === 0;
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
    this.water = 0;
    this.stop();
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
        <button ng-click="connectToChat()">Connect</button>
        <div>
          <div><button ng-click="simChat('+')">Accelerate</button> {{pValue}}</div>
          <div><button ng-click="simChat('-')">Decelerate</button> {{mValue}}</div>
          <div><button ng-click="simChat('<')">Steer Left</button> {{lValue}}</div>
          <div><button ng-click="simChat('>')">Steer Right</button> {{rValue}}</div>
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


      let socket;
      let usernameColorMap = {};
      function onLeakyBucketUpdateCallback(scopeName) {
        return function (oldValue, newValue, dt) {
          scope[scopeName] = newValue;
          applyOverrides();
        }
      }
      let controlLeakyBuckets = {
        accelerate: new LeakyBucket(1, 0.1, onLeakyBucketUpdateCallback('pValue')),
        decelerate: new LeakyBucket(1, 0.1, onLeakyBucketUpdateCallback('mValue')),
        steerLeft: new LeakyBucket(1, 0.1, onLeakyBucketUpdateCallback('lValue')),
        steerRight: new LeakyBucket(1, 0.1, onLeakyBucketUpdateCallback('rValue')),
      }

      scope.simChat = function (message) {
        processCommand({
          username: 'simulated',
          text: message,
          color: "#ffffff",
          isCmd: true,
        })
      }



      scope.connectToChat = function () {
        if (socket) {
          socket.close();
        }

        socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

        socket.onopen = function () {
          // No idea what's happening here with PASS AND NICK, but AI generated it and it works
          // Guessing public shared creds for read only?
          socket.send('PASS SCHMOOPIIE');
          socket.send('NICK justinfan12345');
          socket.send('JOIN #' + scope.channelName);
        };

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
      };

      function getColor(username) {
        if (!usernameColorMap[username]) {
          usernameColorMap[username] = '#' + Math.floor(Math.random() * 16777215).toString(16);
        }
        return usernameColorMap[username];
      }

      function parsePrivmsg(rawMessage) {
        const validCmds = ['+', '-', '<', '>'];
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
            controlLeakyBuckets.accelerate.fill(0.1);
            break;
          case '-':
            controlLeakyBuckets.decelerate.fill(0.1);
            break;
          case '<':
            controlLeakyBuckets.steerLeft.fill(0.1);
            break;
          case '>':
            controlLeakyBuckets.steerRight.fill(0.1);
            break;
          default:
            console.warn(`Unrecognized command: ${parsedMessage.text}`);
        }
      }

      function applyOverrides() {
        const desiredSteer = controlLeakyBuckets.steerRight.value() - controlLeakyBuckets.steerLeft.value();
        const desiredAccell = controlLeakyBuckets.accelerate.value() - controlLeakyBuckets.decelerate.value();
        const throttlePos = Math.min(1, Math.max(0, desiredAccell));
        const brake = Math.min(1, Math.max(0, -desiredAccell));
        const steerPos = Math.min(1, Math.max(-1, desiredSteer));
        bngApi.engineLua(
          `be:getPlayerVehicle(0):queueLuaCommand('extensions.ChatNG:setThrottle(${throttlePos})')`
        );
        bngApi.engineLua(
          `be:getPlayerVehicle(0):queueLuaCommand('extensions.ChatNG:setBrake(${brake})')`
        );
        bngApi.engineLua(
          `be:getPlayerVehicle(0):queueLuaCommand('extensions.ChatNG:setSteer(${steerPos})')`
        );
      }

      element.ready(function () {
        scope.channelName = 'codecorrupt'
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