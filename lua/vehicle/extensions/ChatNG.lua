local _M = {}

_M.throttleOverride = nil
_M.brakeOverride = nil
_M.steeringOverride = nil

function _M.setThrottle(self, val)
	-- log("D", "setThrottle", "SET THROTTLE: " .. val)
	if val == 0 then
		_M.throttleOverride = nil
	else
		_M.throttleOverride = val
	end
end

function _M.setBrake(self, val)
	-- log("D", "setBrake", "SET BRAKE: " .. val)
	if val == 0 then
		_M.brakeOverride = nil
	else
		_M.brakeOverride = val
	end
end

function _M.setSteer(self, val)
	-- log("D", "setSteer", "SET STEERING: " .. val)
	if val == 0 then
		_M.steeringOverride = nil
	else
		_M.steeringOverride = val
	end
end


function _M.updateGFX(self, dt)
	if _M.throttleOverride or _M.brakeOverride or _M.steeringOverride then
		-- log("D", "updateGFX", "Setting overrides: throttle=" .. tostring(_M.throttleOverride) .. ", brake=" .. tostring(_M.brakeOverride) .. ", steering=" .. tostring(_M.steeringOverride))
		electrics.values.steering_input = _M.steeringOverride or electrics.values.steering_input
		electrics.values.throttle = _M.throttleOverride or electrics.values.throttle
		electrics.values.brake = _M.brakeOverride or electrics.values.brake
	end
end

return _M
