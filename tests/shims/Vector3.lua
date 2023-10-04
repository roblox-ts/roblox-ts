local Vector3 = {}
Vector3.__index = Vector3
Vector3.__type = "Vector3"

function Vector3.new(x, y, z)
	local self = setmetatable({}, Vector3)
	self.X = x or 0
	self.Y = y or 0
	self.Z = z or 0
	return self
end

function Vector3:__add(other)
	return Vector3.new(self.X + other.X, self.Y + other.Y, self.Z + other.Z)
end

function Vector3:__sub(other)
	return Vector3.new(self.X - other.X, self.Y - other.Y, self.Z - other.Z)
end

function Vector3:__mul(other)
	if typeof(other) == "number" then
		return Vector3.new(self.X * other, self.Y * other, self.Z * other)
	else
		return Vector3.new(self.X * other.X, self.Y * other.Y, self.Z * other.Z)
	end
end

function Vector3:__div(other)
	if typeof(other) == "number" then
		return Vector3.new(self.X / other, self.Y / other, self.Z / other)
	else
		return Vector3.new(self.X / other.X, self.Y / other.Y, self.Z / other.Z)
	end
end

return Vector3
