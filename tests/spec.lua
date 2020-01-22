-- Import lemur
package.path = package.path .. ";?/init.lua"
local lemur = require("vendor.lemur")

local habitat = lemur.Habitat.new()

-- Services
local ReplicatedStorage = habitat.game:GetService("ReplicatedStorage")

-- Utility Functions
local function newFolder(name, parent, content)
	local folder
	if content then
		folder = habitat:loadFromFs(content)
	else
		folder = lemur.Instance.new("Folder")
	end

	folder.Name = name
	folder.Parent = parent

	return folder
end

-- polyfill for table.create - lemur doesn't support this yet.
function table.create(size, value)
	local t = {}
	for i = 1, size do
		t[i] = value
	end
	return t
end

-- pollyfill for table.find - lemur doesn't support this just yet
function table.find(t, value, init)
	for i = init or 1, #t do
		if t[i] == value then
			return i
		end
	end

	return nil
end

-- Roblox TS Stuff
local robloxTsFolder = newFolder("include", ReplicatedStorage, "lib")

-- Modules
local modulesFolder = newFolder("node_modules", robloxTsFolder)

-- Roact
newFolder("roact", modulesFolder, "tests/node_modules/@rbxts/roact")

-- TestEZ
local testEZFolder = newFolder("TestEZ", ReplicatedStorage, "vendor/testez/src")

-- Testing code
local testsFolder = newFolder("src", ReplicatedStorage)
local outFolder = newFolder("out", testsFolder, "tests/out")

-- Load TestEZ and run our tests
local TestEZ = habitat:require(testEZFolder)

local results = TestEZ.TestBootstrap:run({outFolder}, TestEZ.Reporters.TextReporter)

-- Did something go wrong?
if #results.errors > 0 or results.failureCount > 0 then
	os.exit(1)
end
