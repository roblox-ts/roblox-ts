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

-- Roblox TS Stuff
local robloxTsFolder = newFolder("include", ReplicatedStorage, "lib")

-- Modules
local modulesFolder = newFolder("node_modules", robloxTsFolder)

-- Roact
newFolder("@rbxts/roact", modulesFolder, "tests/node_modules/@rbxts/roact");

-- TestEZ
local testEZFolder = newFolder("TestEZ", ReplicatedStorage, "vendor/testez/lib")

-- Testing code
local testsFolder = newFolder("src", ReplicatedStorage)
local outFolder = newFolder("out", testsFolder, "tests/out")

-- Load TestEZ and run our tests
local TestEZ = habitat:require(testEZFolder)

local results = TestEZ.TestBootstrap:run({ outFolder }, TestEZ.Reporters.TextReporter)

-- Did something go wrong?
if #results.errors > 0 or results.failureCount > 0 then
	os.exit(1)
end
