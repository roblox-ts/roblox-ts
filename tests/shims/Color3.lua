local roblox = require("@lune/roblox")

local Color3 = setmetatable({}, { __index = roblox.Color3 })

function Color3.fromRGB(r, g, b)
	return Color3.new(r / 255, g / 255, b / 255)
end

return Color3
