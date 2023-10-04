local typeof = require("./tests/shims/typeof.lua")

local Vector2int16 = {}
Vector2int16.__index = Vector2int16
Vector2int16.__type = "Vector2int16"

function Vector2int16.new(x, y)
	local self = setmetatable({}, Vector2int16)
	self.X = x or 0
	self.Y = y or 0
	return self
end

function Vector2int16:__add(other)
	return Vector2int16.new(self.X + other.X, self.Y + other.Y)
end

function Vector2int16:__sub(other)
	return Vector2int16.new(self.X - other.X, self.Y - other.Y)
end

function Vector2int16:__mul(other)
	return Vector2int16.new(self.X * other.X, self.Y * other.Y)
end

function Vector2int16:__div(other)
	return Vector2int16.new(self.X / other.X, self.Y / other.Y)
end

return Vector2int16
