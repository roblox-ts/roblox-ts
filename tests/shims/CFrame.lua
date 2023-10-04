local typeof = require("./tests/shims/typeof.lua")
local Vector3 = require("./tests/shims/Vector3.lua")

local CFrame = {}
CFrame.__index = CFrame
CFrame.__type = "CFrame"

function CFrame.new(...)
	local self = setmetatable({}, CFrame)

	local argCount = select("#", ...)

	if argCount == 3 then
		self.X, self.Y, self.Z = ...
		self.R00 = 0
		self.R01 = 0
		self.R02 = 0
		self.R10 = 0
		self.R11 = 0
		self.R12 = 0
		self.R20 = 0
		self.R21 = 0
		self.R22 = 0
	elseif argCount == 12 then
		self.X, self.Y, self.Z, self.R00, self.R01, self.R02, self.R10, self.R11, self.R12, self.R20, self.R21, self.R22 =
			...
	else
		assert(false)
	end

	return self
end

function CFrame:__mul(other)
	if typeof(other) == "Vector3" then
		return Vector3.new(self.X + other.X, self.Y + other.Y, self.Z + other.Z)
	elseif typeof(other) == "CFrame" then
		return CFrame.new(
			self.X + other.X,
			self.Y + other.Y,
			self.Z + other.Z,
			self.R00 + other.R00,
			self.R01 + other.R01,
			self.R02 + other.R02,
			self.R10 + other.R10,
			self.R11 + other.R11,
			self.R12 + other.R12,
			self.R20 + other.R20,
			self.R21 + other.R21,
			self.R22 + other.R22
		)
	else
		assert(false, typeof(other))
	end
end

function CFrame:__add(other)
	if typeof(other) == "Vector3" then
		return CFrame.new(
			self.X + other.X,
			self.Y + other.Y,
			self.Z + other.Z,
			self.R00,
			self.R01,
			self.R02,
			self.R10,
			self.R11,
			self.R12,
			self.R20,
			self.R21,
			self.R22
		)
	elseif typeof(other) == "CFrame" then
		return CFrame.new(
			self.X + other.X,
			self.Y + other.Y,
			self.Z + other.Z,
			self.R00 + other.R00,
			self.R01 + other.R01,
			self.R02 + other.R02,
			self.R10 + other.R10,
			self.R11 + other.R11,
			self.R12 + other.R12,
			self.R20 + other.R20,
			self.R21 + other.R21,
			self.R22 + other.R22
		)
	else
		assert(false, typeof(other))
	end
end

function CFrame:__sub(other)
	if typeof(other) == "Vector3" then
		return CFrame.new(
			self.X - other.X,
			self.Y - other.Y,
			self.Z - other.Z,
			self.R00,
			self.R01,
			self.R02,
			self.R10,
			self.R11,
			self.R12,
			self.R20,
			self.R21,
			self.R22
		)
	elseif typeof(other) == "CFrame" then
		return CFrame.new(
			self.X - other.X,
			self.Y - other.Y,
			self.Z - other.Z,
			self.R00 - other.R00,
			self.R01 - other.R01,
			self.R02 - other.R02,
			self.R10 - other.R10,
			self.R11 - other.R11,
			self.R12 - other.R12,
			self.R20 - other.R20,
			self.R21 - other.R21,
			self.R22 - other.R22
		)
	else
		assert(false, typeof(other))
	end
end

return CFrame
