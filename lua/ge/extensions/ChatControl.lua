local http = require("socket.http")
local json = require("json")

http.TIMEOUT = 0.1

local M = {}

local timeTillNextCheck = 0
local currentAction = nil
local currentIntensity = 0
local timeTillInputRelease = 0

local function getNextAction()
	local response = {}
	local body = {}

	-- log('D', 'doNextAction', 'Calling API. Checking for action...')
	local request, code = http.request({
		url = "http://localhost:8832/get-action",
		method = "GET",
		sink = ltn12.sink.table(body),
	})

	if code == 200 then
		-- data ~~ {"control": "parkingbrake", "intensity": 0.2, "duration": 2.3},
		local data = json.decode(table.concat(body))
		return data
	else
		log("E", "doNextAction", "Failed to get action. Code: " .. code)
		return nil
	end
end

local function doNextAction()
	local data = getNextAction()
	if data == nil or next(data) == nil then
		return
	end
	currentAction = data.control
	currentIntensity = tonumber(data.intensity)
	timeTillInputRelease = tonumber(data.duration)
	log("D", "doNextAction", "Action: " .. currentAction .. ", Duration: " .. timeTillInputRelease)
	be:getPlayerVehicle(0):queueLuaCommand("input.event('" .. currentAction .. "', " .. currentIntensity .. ")")
end

M.onUpdate = function(dt)
	timeTillNextCheck = math.max(timeTillNextCheck - dt, 0)
	timeTillInputRelease = math.max(timeTillInputRelease - dt, 0)
	if timeTillNextCheck <= 0 then
		doNextAction()
		timeTillNextCheck = 5 + timeTillInputRelease
		-- log('D', 'onUpdate', 'Next check in ' .. timeTillNextCheck .. ' seconds')
	end
	if currentAction ~= nil then
		if timeTillInputRelease <= 0 then
			log("D", "onUpdate", "Releasing action...")
			be:getPlayerVehicle(0):queueLuaCommand("input.event('" .. currentAction .. "', " .. 0 .. ")")
			currentAction = nil
			currentIntensity = 0
		else
			be:getPlayerVehicle(0):queueLuaCommand("input.event('" .. currentAction .. "', " .. currentIntensity .. ")")
		end
	end
end

M.onInit = function()
	log("I", "onInit", "Initializing ChatControl...")
end

M.doNextAction = doNextAction

return M
