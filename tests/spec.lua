-- Import lemur
package.path = package.path .. ";?/init.lua"
local lemur = require("submodules.lemur")

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
local robloxTsFolder = newFolder("RobloxTS", ReplicatedStorage)
newFolder("Include", robloxTsFolder, "../include")

-- TestEZ
local testEZFolder = newFolder("TestEZ", ReplicatedStorage, "submodules/testez/lib")

-- Testing code
local testsFolder = newFolder("Tests", ReplicatedStorage)
local outFolder = newFolder("out", testsFolder, "out")

-- Load TestEZ and run our tests
local TestEZ = habitat:require(testEZFolder)

local results = TestEZ.TestBootstrap:run({ outFolder }, TestEZ.Reporters.TextReporter)

-- Did something go wrong?
if results.failureCount > 0 then
	os.exit(1)
end
