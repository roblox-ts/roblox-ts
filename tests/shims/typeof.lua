local builtin_typeof = typeof

local function typeof(value)
	local typeStr = builtin_typeof(value)

	if typeStr == "table" then
		local mt = getmetatable(value)
		if mt and builtin_typeof(mt) == "table" then
			local __type = mt.__type
			if __type ~= nil then
				return __type
			end
		end
	end

	return typeStr
end

return typeof
