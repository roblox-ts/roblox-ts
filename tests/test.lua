local roblox = require("@lune/roblox")
local process = require("@lune/process")
local fs = require("@lune/fs")
local luau = require("@lune/luau")

local placeFile = fs.readFile("./tests/test.rbxlx")
local game = roblox.deserializePlace(placeFile)

local Instance = roblox.Instance

local globals = {}

for _, fileName in fs.readDir("./tests/shims") do
	local name = string.match(fileName, "^(.+)%.lua$")
	assert(name)
	local callableFn = luau.load(luau.compile(fs.readFile(`./tests/shims/{fileName}`)), { debugName = name })
	globals[name] = callableFn()
end

local function tableJoin(...)
	local result = {}
	for i = 1, select("#", ...) do
		for k, v in select(i, ...) do
			result[k] = v
		end
	end
	return result
end

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
				Instance = roblox.Instance,
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
