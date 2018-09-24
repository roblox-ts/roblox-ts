local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Promise = require(script.Parent.Promise)

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
local globalModules = ReplicatedStorage:FindFirstChild("TSModules")

function TS.getModule(moduleName, object)
	if not globalModules then
		error("roblox-ts: Could not find any modules!")
	end
	if object:IsDescendantOf(globalModules) then
		while object.Parent and object.Parent ~= globalModules do
			local modules = object:FindFirstChild("node_modules")
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
	error("roblox-ts: Could not find module: " .. moduleName)
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
		if obj.__index == class then
			return true
		end
		obj = obj.__base
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
		error(result, 2)
	end
end

-- array macro functions
TS.array = {}

function TS.array.forEach(list, func)
	for i = 1, #list do
		func(list[i], i, list)
	end
end

function TS.array.map(list, func)
	local out = {}
	for i = 1, #list do
		table.insert(out, func(list[i]))
	end
	return out
end

function TS.array.filter(list, func)
	local out = {}
	for i = 1, #list do
		if func(list[i]) then
			table.insert(out, list[i])
		end
	end
	return out
end

function TS.array.slice(list, startI, endI)
	if not endI or endI > #list then endI = #list end
	if startI < 1 then startI = math.max(#list + startI, 1) end
	if endI < 1 then endI = math.max(#list + endI, 1) end
	local out = {}
	for i = startI, endI do
		table.insert(out, list[i])
	end
	return out
end


function TS.array.splice(list, start, deleteCount, ...)
	local len = #list
	local actualStart
	if start <  0 then
		actualStart = math.max(len + start, 0)
	else
		actualStart = math.min(start, len)
	end
	local items = {...}
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

function TS.array.some(list, func)
	return #TS.array.filter(list, func) > 0
end

function TS.array.every(list, func)
	return #list == #TS.array.filter(list, func)
end

function TS.array.indexOf(list, object)
	for i = 1, #list do
		if object == list[i] then
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
		initialValue = list[1]
		start = 2
	end
	local accumulator = initialValue
	for i = start, #list do
		callback(accumulator, list[i], i)
	end
end

function TS.array.reduceRight(list, callback, initialValue)
	local start = 1
	if not initialValue then
		initialValue = list[1]
		start = 2
	end
	local accumulator = initialValue
	for i = #list, start do
		callback(accumulator, list[i], i)
	end
end

function TS.array.shift(list)
	return table.remove(list, 1)
end

function TS.array.unshift(list, ...)
	local args = { ... }
	for i = #list, 1 do
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
		if typeof(value) == "table" then
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

-- map macro functions
TS.map = {}

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

function TS.string.replace(source, searchVal, newVal)
	return string.gsub(source, searchVal, newVal)
end

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

return TS
