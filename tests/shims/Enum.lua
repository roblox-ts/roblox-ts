local roblox = require("@lune/roblox")

local Enum = setmetatable({}, { __index = roblox.Enum })

function Enum:GetEnums()
	local db = roblox.getReflectionDatabase()

	local result = {}
	for _, enumName in db:GetEnumNames() do
		table.insert(result, Enum[enumName])
	end

	return result
end

return Enum
