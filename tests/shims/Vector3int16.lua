local Vector3int16 = {}
Vector3int16.__index = Vector3int16
Vector3int16.__type = "Vector3int16"

function Vector3int16.new(x, y, z)
	local self = setmetatable({}, Vector3int16)
	self.X = x or 0
	self.Y = y or 0
	self.Z = z or 0
	return self
end

function Vector3int16:__add(other)
	return Vector3int16.new(self.X + other.X, self.Y + other.Y, self.Z + other.Z)
end

function Vector3int16:__sub(other)
	return Vector3int16.new(self.X - other.X, self.Y - other.Y, self.Z - other.Z)
end

function Vector3int16:__mul(other)
	return Vector3int16.new(self.X * other.X, self.Y * other.Y, self.Z * other.Z)
end

function Vector3int16:__div(other)
	return Vector3int16.new(self.X / other.X, self.Y / other.Y, self.Z / other.Z)
end

return Vector3int16
