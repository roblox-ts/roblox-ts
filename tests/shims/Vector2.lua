local typeof = require("./tests/shims/typeof.lua")

local Vector2 = {}
Vector2.__index = Vector2
Vector2.__type = "Vector2"

function Vector2.new(x, y)
	local self = setmetatable({}, Vector2)
	self.X = x or 0
	self.Y = y or 0
	return self
end

function Vector2:__add(other)
	return Vector2.new(self.X + other.X, self.Y + other.Y)
end

function Vector2:__sub(other)
	return Vector2.new(self.X - other.X, self.Y - other.Y)
end

function Vector2:__mul(other)
	if typeof(other) == "number" then
		return Vector2.new(self.X * other, self.Y * other)
	else
		return Vector2.new(self.X * other.X, self.Y * other.Y)
	end
end

function Vector2:__div(other)
	if typeof(other) == "number" then
		return Vector2.new(self.X / other, self.Y / other)
	else
		return Vector2.new(self.X / other.X, self.Y / other.Y)
	end
end

return Vector2
