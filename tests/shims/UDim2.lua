local UDim = require("./tests/shims/UDim.lua")

local UDim2 = {}
UDim2.__index = UDim2
UDim2.__type = "UDim2"

function UDim2.new(...)
	local self = setmetatable({}, UDim2)

	local argCount = select("#", ...)
	if argCount == 0 then
		self.X = UDim.new()
		self.Y = UDim.new()
	elseif argCount == 2 then
		self.X, self.Y = ...
	elseif argCount == 4 then
		local scaleX, offsetX, scaleY, offsetY = ...
		self.X = UDim.new(scaleX, offsetX)
		self.Y = UDim.new(scaleY, offsetY)
	end

	return self
end

function UDim2:__add(other)
	return UDim2.new(self.X + other.X, self.Y + other.Y)
end

function UDim2:__sub(other)
	return UDim2.new(self.X - other.X, self.Y - other.Y)
end

return UDim2
