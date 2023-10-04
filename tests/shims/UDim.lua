local UDim = {}
UDim.__index = UDim
UDim.__type = "UDim"

function UDim.new(scale, offset)
	local self = setmetatable({}, UDim)
	self.Scale = scale or 0
	self.Offset = offset or 0
	return self
end

function UDim:__add(other)
	return UDim.new(self.Scale + other.Scale, self.Offset + other.Offset)
end

function UDim:__sub(other)
	return UDim.new(self.Scale - other.Scale, self.Offset - other.Offset)
end

return UDim
