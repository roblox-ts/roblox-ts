local roblox = require("@lune/roblox")
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")
local stdio = require("@lune/stdio")

local testPlacePath = process.args[1]

local game = roblox.deserializePlace(fs.readFile(testPlacePath))

local function tableJoin(...)
	local result = {}
	for i = 1, select("#", ...) do
		for k, v in select(i, ...) do
			result[k] = v
		end
	end
	return result
end

local shims = {}

for _, fileName in fs.readDir("./tests/shims") do
	local name = string.match(fileName, "^(.+)%.lua$")
	assert(name)
	local callableFn = luau.load(luau.compile(fs.readFile(`./tests/shims/{fileName}`)), { debugName = name })
	shims[name] = callableFn()
end

local globals = tableJoin(roblox, shims)

local requireCache = {}

local function robloxRequire(script: LuaSourceContainer)
	-- the same script instance sometimes gives a different ref
	-- unsure why, but using :GetFullName() fixes this for now
	local scriptPath = script:GetFullName()
	local cached = requireCache[scriptPath]
	if cached then
		return table.unpack(cached)
	end

	local callableFn = luau.load(luau.compile(script.Source), { debugName = script:GetFullName() })

	setfenv(
		callableFn,
		setmetatable(
			tableJoin(globals, {
				game = game,
				script = script,
				require = robloxRequire,
			}),
			{ __index = getfenv(callableFn) }
		)
	)

	local result = table.pack(callableFn())
	requireCache[scriptPath] = result
	return table.unpack(result)
end

-- roblox.spec.ts assumes Workspace already exists
game:GetService("Workspace")

-- RuntimeLib uses :WaitForChild(), but tests don't need networking so :FindFirstChild() should be fine
roblox.implementMethod("Instance", "WaitForChild", function(self, ...)
	return self:FindFirstChild(...)
end)

-- TestEZ uses TestService:Error() when tests fail
roblox.implementMethod("TestService", "Error", function(description: string, source: Instance?, line: number?)
	stdio.ewrite(`{description}\n`)
end)

-- Promise.lua indexes RunService.Heartbeat, but only uses it in Promise.defer and Promise.delay
roblox.implementProperty(
	"RunService",
	"Heartbeat",
	function()
		return {}
	end,
	function() end
)

robloxRequire(game.ServerScriptService.main)
