local _M = {}

function _M.reset(self)
	log("D", "reset", "RESETTING...: ")
	-- obj:queueGameEngineLua('extensions.hook("trackVehReset")')
	--recovery.startRecovering()
	--recovery.stopRecovering()
	recovery.loadHome()
end

_M.chatControlling = false
_M.throttleOverride = 0
_M.brakeOverride = 0
_M.steeringOverride = 0

function _M.setThrottle(self, val)
	if not _M.chatControlling then
		return
	end
	log("D", "setThrottle", "SET THROTTLE: " .. val)
	_M.throttleOverride = val
end

function _M.setBrake(self, val)
	if not _M.chatControlling then
		return
	end
	log("D", "setBrake", "SET BRAKE: " .. val)
	_M.brakeOverride = val
end

function _M.setSteer(self, val)
	if not _M.chatControlling then
		return
	end
	log("D", "setSteer", "SET STEERING: " .. val)
	_M.steeringOverride = val
end

function _M.setChatControlling(self, isControlling)
	-- log("D", "chatControlling", "SET CHAT CONTROLLING: " .. tostring(isControlling))
	_M.chatControlling = isControlling
	if not isControlling then
		_M.throttleOverride = 0
		_M.brakeOverride = 0
		_M.steeringOverride = 0
	end
end

local lastThrottle = 0
local lastBrake = 0
local lastSteering = 0
function _M.updateGFX(self, dt)
	if _M.steeringOverride ~= 0 or lastSteering ~= 0 then
		-- electrics.values.steering_input = _M.steeringOverride or electrics.values.steering_input
		input.event('steering', _M.steeringOverride)
	end
	lastSteering = _M.steeringOverride

	if _M.throttleOverride ~= 0 or lastThrottle ~= 0 then
		-- electrics.values.throttle = _M.throttleOverride or electrics.values.throttle
		input.event('throttle', _M.throttleOverride)
	end
	lastThrottle = _M.throttleOverride

	if _M.brakeOverride ~= 0 or lastBrake ~= 0 then
		-- electrics.values.brake = _M.brakeOverride or electrics.values.brake
		input.event('brake', _M.brakeOverride)
	end
	lastBrake = _M.brakeOverride
end

return _M
