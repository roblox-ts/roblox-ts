local Promise = require(script.Parent.Promise)

-- constants
local TYPE_TABLE = "table"
local TYPE_STRING = "string"

local TS = {}

-- runtime classes
TS.Promise = Promise

local Symbol do
	Symbol = {}
	Symbol.__index = Symbol
	setmetatable(Symbol, {
		__call = function(_, description)
			local self = setmetatable({}, Symbol)
			self.description = description or ""
			return self
		end
	})

	function Symbol:__tostring()
		return "Symbol(" .. self.description .. ")"
	end

	function Symbol:toString()
		return tostring(self)
	end
end
TS.Symbol = Symbol

-- module resolution
local globalModules = script.Parent.Parent:FindFirstChild("Modules")

function TS.getModule(moduleName, object)
	if not globalModules then
		error("Could not find any modules!", 2)
	end
	if object:IsDescendantOf(globalModules) then
		while object.Parent do
			local modules = object == globalModules and object or object:FindFirstChild("node_modules")
			if modules then
				local module = modules:FindFirstChild(moduleName)
				if module then
					return module
				end
			end
			object = object.Parent
		end
	else
		local module = globalModules:FindFirstChild(moduleName)
		if module then
			return module
		end
	end
	error("Could not find module: " .. moduleName, 2)
end

function TS.import(root, ...)
	local currentInstance = typeof(root) == "Instance" and root or game:GetService(root)
	local path = { ... }
	if currentInstance then
		for _, part in pairs(path) do
			currentInstance = currentInstance and currentInstance:WaitForChild(part)
		end
	end
	if currentInstance and currentInstance:IsA("ModuleScript") then
		return require(currentInstance)
	else
		error("Failed to import!", 2)
	end
end

function TS.exportNamespace(module, ancestor)
	for key, value in pairs(module) do
		ancestor[key] = value
	end
end

-- general utility functions
function TS.typeof(value)
	local type = typeof(value)
	if type == "table" then
		return "object"
	elseif type == "nil" then
		return "undefined"
	else
		return type
	end
end

function TS.instanceof(obj, class)
    while obj ~= nil do
        if obj == class then
            return true
        end
        obj = getmetatable(obj)
    end
    return false
end

function TS.isA(instance, className)
	return typeof(instance) == "Instance" and instance:IsA(className)
end

function TS.async(callback)
	return function(...)
		local args = { ... }
		return Promise.new(function(resolve, reject)
			coroutine.wrap(function()
				local ok, result = pcall(callback, unpack(args))
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
	local ok, result = promise:await()
	if ok then
		return result
	else
		TS.error(result)
	end
end

function TS.add(a, b)
	if typeof(a) == TYPE_STRING or typeof(b) == TYPE_STRING then
		return a .. b
	else
		return a + b
	end
end

-- bitwise operations

function TS.bor(a, b)
	-- TODO
	TS.error("TODO")
end

-- array macro functions
TS.array = {}

function TS.array.forEach(list, callback)
	for i = 1, #list do
		callback(list[i], i - 1, list)
	end
end

function TS.array.map(list, callback)
	local result = {}
	for i = 1, #list do
		result[i] = callback(list[i], i - 1, list)
	end
	return result
end

function TS.array.filter(list, callback)
	local result = {}
	for i = 1, #list do
		local v = list[i]
		if callback(v, i - 1, list) == true then
			result[#result + 1] = v
		end
	end
	return result
end

function TS.array.slice(list, startI, endI)
	local length = #list
	if not startI then
		startI = 0
	end
	if not endI then
		endI = length
	end
	if startI < 0 then
		startI = length + startI
	end
	if endI < 0 then
		endI = length + endI
	end
	startI = startI + 1
	endI = endI + 1
	local result = {}
	for i = startI, endI - 1 do
		result[i - startI + 1] = list[i]
	end
	return result
end

function TS.array.splice(list, start, deleteCount, ...)
	local len = #list
	local actualStart
	if start <  0 then
		actualStart = math.max(len + start, 0)
	else
		actualStart = math.min(start, len)
	end
	local items = { ... }
	local itemCount = #items
	local actualDeleteCount
	if not start then
		actualDeleteCount = 0
	elseif not deleteCount then
		actualDeleteCount = len - actualStart
	else
		actualDeleteCount = math.min(math.max(deleteCount, 0), len - actualStart)
	end
	local out = {}
	local k = 0
	while k < actualDeleteCount do
		local from = actualStart + k
		if list[from + 1] then
			out[k + 1] = list[from + 1]
		end
		k = k + 1
	end
	if itemCount < actualDeleteCount then
		k = actualStart
		while k < len - actualDeleteCount do
			local from = k + actualDeleteCount
			local to = k + itemCount
			if list[from + 1] then
				list[to + 1] = list[from + 1]
			else
				list[to + 1] = nil
			end
			k = k + 1
		end
		k = len
		while k > len - actualDeleteCount + itemCount do
			list[k] = nil
			k = k - 1
		end
	elseif itemCount > actualDeleteCount then
		k = len - actualDeleteCount
		while k > actualStart do
			local from = k + actualDeleteCount
			local to = k + itemCount
			if list[from] then
				list[to] = list[from]
			else
				list[to] = nil
			end
			k = k - 1
		end
	end
	k = actualStart
	for i = 1, #items do
		list[k + 1] = items[i]
		k = k + 1
	end
	k = #list
	while k > len - actualDeleteCount + itemCount do
		list[k] = nil
		k = k - 1
	end
	return out
end

function TS.array.some(list, callback)
	for i = 1, #list do
		if callback(list[i], i - 1, list) == true then
			return true
		end
	end
	return false
end

function TS.array.every(list, callback)
	for i = 1, #list do
		if callback(list[i], i - 1, list) == false then
			return false
		end
	end
	return true
end

function TS.array.indexOf(list, value, fromIndex)
	if fromIndex == nil then
		fromIndex = 0
	end
	fromIndex = fromIndex + 1
	for i = fromIndex, #list do
		if value == list[i] then
			return i - 1
		end
	end
	return -1
end

function TS.array.lastIndexOf(list, value, fromIndex)
	if fromIndex == nil then
		fromIndex = #list - 1
	end
	fromIndex = fromIndex + 1
	for i = fromIndex, 1, -1 do
		if value == list[i] then
			return i - 1
		end
	end
	return -1
end

function TS.array.reverse(list)
	local result = {}
	for i = 1, #list do
		result[i] = list[#list - i + 1]
	end
	return result
end

function TS.array.reduce(list, callback, initialValue)
	local start = 1
	if not initialValue then
		initialValue = list[start]
		start = start + 1
	end
	local accumulator = initialValue
	for i = start, #list do
		accumulator = callback(accumulator, list[i], i)
	end
	return accumulator
end

function TS.array.reduceRight(list, callback, initialValue)
	local start = #list
	if not initialValue then
		initialValue = list[start]
		start = start - 1
	end
	local accumulator = initialValue
	for i = start, 1, -1 do
		accumulator = callback(accumulator, list[i], i)
	end
	return accumulator
end

function TS.array.shift(list)
	return table.remove(list, 1)
end

function TS.array.unshift(list, ...)
	local args = { ... }
	for i = #list, 1, -1 do
		list[i + #args] = list[i]
	end
	for i = 1, #args do
		list[i] = args[i]
	end
	return #list
end

function TS.array.concat(list, ...)
	local args = { ... }
	local result = {}
	for i = 1, #list do
		result[i] = list[i]
	end
	for i = 1, #args do
		local value = args[i]
		if typeof(value) == TYPE_TABLE then
			for j = 1, #value do
				result[#result + 1] = value[j]
			end
		else
			result[#result + 1] = value
		end
	end
	return result
end

function TS.array.push(list, ...)
	local args = { ... }
	for i = 1, #args do
		list[#list + 1] = args[i]
	end
end

function TS.array.pop(list)
	return table.remove(list)
end

function TS.array.join(list, separator)
	if #list == 0 then
		return ""
	end
	if not separator then
		separator = ", "
	end
	local result = tostring(list[1])
	for i = 2, #list do
		result = result .. separator .. tostring(list[i])
	end
	return result
end

function TS.array.find(list, callback)
	for i = 1, #list do
		if callback(list[i], i - 1, list) == true then
			return list[i]
		end
	end
end

-- map macro functions
TS.map = {}

function TS.map.new(value)
	local result = {}
	for _, pair in pairs(value) do
		result[pair[1]] = pair[2]
	end
	return result
end

function TS.map.clear(map)
	for key in pairs(map) do
		map[key] = nil
	end
end

function TS.map.size(map)
	local result = 0
	for _ in pairs(map) do
		result = result + 1
	end
	return result
end

function TS.map.entries(map)
	local result = {}
	for key in pairs(map) do
		table.insert(result, {key, map[key]})
	end
	return result
end

function TS.map.forEach(map, callback)
	for key, value in pairs(map) do
		callback(value, key, map)
	end
end

function TS.map.get(map, key)
	return map[key]
end

function TS.map.has(map, key)
	return map[key] ~= nil
end

function TS.map.keys(map)
	local result = {}
	for key in pairs(map) do
		table.insert(result, key)
	end
	return result
end

function TS.map.set(map, key, value)
	map[key] = value
	return map
end

function TS.map.values(map)
	local result = {}
	for _, value in pairs(map) do
		table.insert(result, value)
	end
	return result
end

-- set macro functions
TS.set = {}

function TS.set.new(value)
	local result = {}
	for _, v in pairs(value) do
		result[v] = true
	end
	return result
end

function TS.set.add(set, value)
	set[value] = true
	return set
end

TS.set.clear = TS.map.clear

function TS.set.delete(set, value)
	local result = TS.set.has(set, value)
	set[value] = nil
	return result
end

function TS.set.forEach(set, callback)
	for key in pairs(set) do
		callback(key, key, set)
	end
end

TS.set.has = TS.map.has

TS.set.entries = TS.map.entries

TS.set.values = TS.map.keys

TS.set.keys = TS.map.keys

TS.set.size = TS.map.size

-- string macro functions
TS.string = {}

function TS.string.split(input, sep)
	if sep == nil then
		sep = "%s"
	end
	local result = {}
	for str in string.gmatch(input, "[^" .. sep .. "]+") do
		table.insert(result, str)
	end
	return result
end

-- Object static functions
TS.Object = {}

function TS.Object.keys(object)
	local result = {}
	for key in pairs(object) do
		result[#result + 1] = key
	end
	return result
end

function TS.Object.values(object)
	local result = {}
	for _, value in pairs(object) do
		result[#result + 1] = value
	end
	return result
end

function TS.Object.entries(object)
	local result = {}
	for key, value in pairs(object) do
		result[#result + 1] = {key, value}
	end
	return result
end

function TS.Object.assign(toObj, ...)
	for _, fromObj in ipairs({ ... }) do
		for key, value in pairs(fromObj) do
			toObj[key] = value
		end
	end
	return toObj
end

-- Error objects
local errors = setmetatable({}, {__mode = "v"})

function TS.error(object, level)
	if level ~= 0 then
		level = (level or 1) + 1
	end
	local id = ""
	for i = 1, 16 do
		id = id .. string.char(math.random(65, 90))
	end
	if type(object) == "table" and object.message ~= nil then
		id = id .. "; message: " .. object.message
	end
	errors[id] = object
	error("error: [<[" .. id .. "]>]", level)
end

function TS.decodeError(errorMessage)
	local result
	local key = errorMessage:match("error%: %[%<%[(.-)%]%>%]")
	if key ~= nil then
		result = errors[key]
	end
	return result or errorMessage
end

return TS
