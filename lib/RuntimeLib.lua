local Promise = require(script.Parent.Promise)

local RunService = game:GetService("RunService")
local ReplicatedFirst = game:GetService("ReplicatedFirst")

local ERROR_PREFIX = "roblox-ts: "
local NODE_MODULES = "node_modules"
local DEFAULT_SCOPE = "@rbxts"

local manifest = require(script.Parent.manifest)
manifest.reverse = {}

local MANIFEST_PARENT_SYMBOL = {}

-- sets up parent links + manifest.reverse
local function patchManifest(node)
	local rbxPath = node._rbxPath
	if rbxPath ~= nil then
		manifest.reverse[rbxPath] = node
	end
	for name, child in node do
		if name ~= MANIFEST_PARENT_SYMBOL and type(child) ~= "string" then
			child[MANIFEST_PARENT_SYMBOL] = node
			patchManifest(child)
		end
	end
end
patchManifest(manifest)

local TS = {}

TS.Promise = Promise

local function isPlugin(object)
	return RunService:IsStudio() and object:FindFirstAncestorWhichIsA("Plugin") ~= nil
end

local function hash(instance)
	if instance.Parent and instance.Parent ~= game then
		return hash(instance.Parent) .. ">" .. instance.Name
	else
		return instance.Name
	end
end

local function findPackageFolderAncestor(instance)
	if instance.Parent then
		if string.sub(instance.Parent.Name, 1, 1) == "@" then
			return instance
		else
			return findPackageFolderAncestor(instance.Parent)
		end
	end
end

local function waitForVirtualNode(virtualNode)
	local rbxPath = virtualNode._rbxPath
	if rbxPath == nil then
		error(ERROR_PREFIX .. "VirtualNode did not have a _rbxPath!", 3)
	end
	local obj = game
	for _, part in string.split(rbxPath, ">") do
		obj = obj:WaitForChild(part)
	end
	return obj
end

function TS.getModuleRelative(context, scope, moduleName)
	-- legacy call signature
	if moduleName == nil then
		moduleName = scope
		scope = DEFAULT_SCOPE
	end

	if RunService:IsRunning() and context:IsDescendantOf(ReplicatedFirst) then
		warn("roblox-ts packages should not be used from ReplicatedFirst!")
	end

	-- ensure modules have fully replicated
	if RunService:IsRunning() and RunService:IsClient() and not isPlugin(context) and not game:IsLoaded() then
		game.Loaded:Wait()
	end

	local packageFolder = findPackageFolderAncestor(context)
	local packageFolderHash = hash(packageFolder)
	local virtualNode = manifest.reverse[packageFolderHash]
	if not virtualNode then
		error(ERROR_PREFIX .. string.format("Could not %s in manifest.json", packageFolderHash), 2)
	end

	repeat
		local nodeModulesFolder = virtualNode[NODE_MODULES]
		if nodeModulesFolder then
			local scopeFolder = nodeModulesFolder[scope]
			if scopeFolder then
				local module = scopeFolder[moduleName]
				if module then
					return waitForVirtualNode(module)
				end
			end
		end
		virtualNode = virtualNode[MANIFEST_PARENT_SYMBOL]
	until virtualNode == nil

	error(ERROR_PREFIX .. "Could not find module: " .. moduleName, 2)
end
TS.getModule = TS.getModuleRelative

function TS.getModuleGlobal(object, scope, moduleName)
	local globalModules = manifest[NODE_MODULES]
	if not globalModules then
		error(ERROR_PREFIX .. "Could not find global node_modules!", 2)
	end

	local scopeFolder = globalModules[scope]
	if not scopeFolder then
		error(ERROR_PREFIX .. "Could not find node_modules scope: " .. scope, 2)
	end

	local module = scopeFolder[moduleName]
	if module then
		return waitForVirtualNode(module)
	end

	error(ERROR_PREFIX .. "Could not find module: " .. moduleName, 2)
end

-- This is a hash which TS.import uses as a kind of linked-list-like history of [Script who Loaded] -> Library
local currentlyLoading = {}
local registeredLibraries = {}

function TS.import(caller, module, ...)
	for i = 1, select("#", ...) do
		module = module:WaitForChild((select(i, ...)))
	end

	if module.ClassName ~= "ModuleScript" then
		error(ERROR_PREFIX .. "Failed to import! Expected ModuleScript, got " .. module.ClassName, 2)
	end

	currentlyLoading[caller] = module

	-- Check to see if a case like this occurs:
	-- module -> Module1 -> Module2 -> module

	-- WHERE currentlyLoading[module] is Module1
	-- and currentlyLoading[Module1] is Module2
	-- and currentlyLoading[Module2] is module

	local currentModule = module
	local depth = 0

	while currentModule do
		depth = depth + 1
		currentModule = currentlyLoading[currentModule]

		if currentModule == module then
			local str = currentModule.Name -- Get the string traceback

			for _ = 1, depth do
				currentModule = currentlyLoading[currentModule]
				str = str .. "  ⇒ " .. currentModule.Name
			end

			error(ERROR_PREFIX .. "Failed to import! Detected a circular dependency chain: " .. str, 2)
		end
	end

	if not registeredLibraries[module] then
		if _G[module] then
			error(
				ERROR_PREFIX
				.. "Invalid module access! Do you have multiple TS runtimes trying to import this? "
				.. module:GetFullName(),
				2
			)
		end

		_G[module] = TS
		registeredLibraries[module] = true -- register as already loaded for subsequent calls
	end

	local data = require(module)

	if currentlyLoading[caller] == module then -- Thread-safe cleanup!
		currentlyLoading[caller] = nil
	end

	return data
end

function TS.instanceof(obj, class)
	-- custom Class.instanceof() check
	if type(class) == "table" and type(class.instanceof) == "function" then
		return class.instanceof(obj)
	end

	-- metatable check
	if type(obj) == "table" then
		obj = getmetatable(obj)
		while obj ~= nil do
			if obj == class then
				return true
			end
			local mt = getmetatable(obj)
			if mt then
				obj = mt.__index
			else
				obj = nil
			end
		end
	end

	return false
end

function TS.async(callback)
	return function(...)
		local n = select("#", ...)
		local args = { ... }
		return Promise.new(function(resolve, reject)
			coroutine.wrap(function()
				local ok, result = pcall(callback, unpack(args, 1, n))
				if ok then
					resolve(result)
				else
					reject(result)
				end
			end)()
		end)
	end
end

function TS.await(promise)
	if not Promise.is(promise) then
		return promise
	end

	local status, value = promise:awaitStatus()
	if status == Promise.Status.Resolved then
		return value
	elseif status == Promise.Status.Rejected then
		error(value, 2)
	else
		error("The awaited Promise was cancelled", 2)
	end
end

function TS.bit_lrsh(a, b)
	local absA = math.abs(a)
	local result = bit32.rshift(absA, b)
	if a == absA then
		return result
	else
		return -result - 1
	end
end

TS.TRY_RETURN = 1
TS.TRY_BREAK = 2
TS.TRY_CONTINUE = 3

function TS.try(func, catch, finally)
	local err, traceback
	local success, exitType, returns = xpcall(
		func,
		function(errInner)
			err = errInner
			traceback = debug.traceback()
		end
	)
	if not success and catch then
		local newExitType, newReturns = catch(err, traceback)
		if newExitType then
			exitType, returns = newExitType, newReturns
		end
	end
	if finally then
		local newExitType, newReturns = finally()
		if newExitType then
			exitType, returns = newExitType, newReturns
		end
	end
	return exitType, returns
end

function TS.generator(callback)
	local co = coroutine.create(callback)
	return {
		next = function(...)
			if coroutine.status(co) == "dead" then
				return { done = true }
			else
				local success, value = coroutine.resume(co, ...)
				if success == false then
					error(value, 2)
				end
				return {
					value = value,
					done = coroutine.status(co) == "dead",
				}
			end
		end,
	}
end

return TS
