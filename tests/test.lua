local roblox = require("@lune/roblox")
local fs = require("@lune/fs")
local luau = require("@lune/luau")

local game = roblox.deserializePlace(fs.readFile("./tests/test.rbxlx"))

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

game:GetService("Workspace")

robloxRequire(game.ServerScriptService.main)
