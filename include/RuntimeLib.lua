local Promise = require(script.Parent.Promise)

-- constants
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

	local symbolRegistry = setmetatable({}, {
		__index = function(self, k)
			self[k] = Symbol(k)
			return self[k]
		end
	})

	function Symbol:__tostring()
		return "Symbol(" .. self.description .. ")"
	end

	function Symbol:toString()
		return tostring(self)
	end

	-- Symbol.for
	function Symbol.getFor(key)
		return symbolRegistry[key]
	end

	function Symbol.keyFor(goalSymbol)
		for key, symbol in pairs(symbolRegistry) do
			if symbol == goalSymbol then
				return key
			end
		end
	end
end
TS.Symbol = Symbol

-- Instance class values
TS.Instance = setmetatable({}, {
	__index = function(self, className)
		local object = setmetatable({
			new = function(parent)
				return Instance.new(className, parent)
			end
		}, {
			__tostring = function()
				return className
			end
		})
		self[className] = object
		return self[className]
	end
})

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
	if not Promise.is(promise) then
		return promise
	end

	local ok, result = promise:await()
	if ok then
		return result
	else
		TS.error(ok == nil and "The awaited Promise was cancelled" or result, 2)
	end
end

function TS.add(a, b)
	if typeof(a) == TYPE_STRING or typeof(b) == TYPE_STRING then
		return a .. b
	else
		return a + b
	end
end

function TS.round(a)
	if a < 0 then
		return math.ceil(a)
	else
		return math.floor(a)
	end
end

-- bitwise operations

local function bitop(a, b, oper)
	local r, m, s = 0, 2^52
	repeat
		s, a, b = a + b + m, a % m, b % m
		r, m = r + m * oper % (s - a - b), m / 2
	until m < 1
	return r
end

function TS.bor(a, b)
	a = TS.round(tonumber(a))
	b = TS.round(tonumber(b))
	return bitop(a, b, 1)
end

function TS.band(a, b)
	a = TS.round(tonumber(a))
	b = TS.round(tonumber(b))
	return bitop(a, b, 4)
end

function TS.bxor(a, b)
	a = TS.round(tonumber(a))
	b = TS.round(tonumber(b))
	return bitop(a, b, 3)
end

function TS.blsh(a, b)
	a = TS.round(tonumber(a))
	b = TS.round(tonumber(b))
	return a * 2 ^ b
end

function TS.brsh(a, b)
	a = TS.round(tonumber(a))
	b = TS.round(tonumber(b))
	return TS.round(a / 2 ^ b)
end

-- array macro functions

function TS.array_forEach(list, callback)
	for i = 1, #list do
		callback(list[i], i - 1, list)
	end
end

function TS.array_map(list, callback)
	local result = {}
	for i = 1, #list do
		result[i] = callback(list[i], i - 1, list)
	end
	return result
end

function TS.array_filter(list, callback)
	local result = {}
	for i = 1, #list do
		local v = list[i]
		if callback(v, i - 1, list) == true then
			result[#result + 1] = v
		end
	end
	return result
end

function TS.array_slice(list, startI, endI)
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

function TS.array_splice(list, start, deleteCount, ...)
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

function TS.array_some(list, callback)
	for i = 1, #list do
		if callback(list[i], i - 1, list) == true then
			return true
		end
	end
	return false
end

function TS.array_every(list, callback)
	for i = 1, #list do
		if callback(list[i], i - 1, list) == false then
			return false
		end
	end
	return true
end

function TS.array_indexOf(list, value, fromIndex)
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

function TS.array_lastIndexOf(list, value, fromIndex)
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

function TS.array_reverse(list)
	local result = {}
	local length = #list
	for i = 1, length do
		result[i] = list[length - i + 1]
	end
	return result
end

function TS.array_reduce(list, callback, initialValue)
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

function TS.array_reduceRight(list, callback, initialValue)
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

function TS.array_shift(list)
	return table.remove(list, 1)
end

function TS.array_unshift(list, ...)
	local args = { ... }
	local argsLength = #args
	for i = #list, 1, -1 do
		list[i + argsLength] = list[i]
	end
	for i = 1, argsLength do
		list[i] = args[i]
	end
	return #list
end

function TS.array_concat(list, ...)
	local args = { ... }
	local result = {}
	for i = 1, #list do
		result[i] = list[i]
	end
	for i = 1, #args do
		local value = args[i]
		for j = 1, #value do
			result[#result + 1] = value[j]
		end
	end
	return result
end

function TS.array_push(list, ...)
	local args = { ... }
	for i = 1, #args do
		list[#list + 1] = args[i]
	end
end

function TS.array_pop(list)
	local length = #list
	local lastValue = list[length]
	list[length] = nil
	return lastValue
end

function TS.array_join(list, separator)
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

function TS.array_find(list, callback)
	for i = 1, #list do
		if callback(list[i], i - 1, list) == true then
			return list[i]
		end
	end
end

-- map macro functions

function TS.map_new(value)
	local result = {}
	for _, pair in pairs(value) do
		result[pair[1]] = pair[2]
	end
	return result
end

function TS.map_clear(map)
	for key in pairs(map) do
		map[key] = nil
	end
end

function TS.map_delete(map, key)
	local has = TS.map_has(map, key)
	if has then
		map[key] = nil
	end
	return has
end

function TS.map_size(map)
	local result = 0
	for _ in pairs(map) do
		result = result + 1
	end
	return result
end

function TS.map_entries(map)
	local result = {}
	for key, value in pairs(map) do
		table.insert(result, {key, value})
	end
	return result
end

function TS.map_forEach(map, callback)
	for key, value in pairs(map) do
		callback(value, key, map)
	end
end

function TS.map_get(map, key)
	return map[key]
end

function TS.map_has(map, key)
	return map[key] ~= nil
end

function TS.map_keys(map)
	local result = {}
	for key in pairs(map) do
		table.insert(result, key)
	end
	return result
end

function TS.map_set(map, key, value)
	map[key] = value
	return map
end

function TS.map_values(map)
	local result = {}
	for _, value in pairs(map) do
		table.insert(result, value)
	end
	return result
end

-- set macro functions

function TS.set_new(value)
	local result = {}
	for _, v in pairs(value) do
		result[v] = true
	end
	return result
end

function TS.set_add(set, value)
	set[value] = true
	return set
end

TS.set_clear = TS.map_clear

function TS.set_delete(set, value)
	local result = TS.set_has(set, value)
	set[value] = nil
	return result
end

function TS.set_forEach(set, callback)
	for key in pairs(set) do
		callback(key, key, set)
	end
end

TS.set_has = TS.map_has

function TS.set_entries(map)
	local result = {}
	for key in pairs(map) do
		table.insert(result, {key, key})
	end
	return result
end

TS.set_values = TS.map_keys

TS.set_keys = TS.map_keys

TS.set_size = TS.map_size

-- string macro functions

function TS.string_split(input, sep)
	local result = {}
	local count = 0
	for str in input:gmatch(sep == "" and "." or "[^" .. sep .. "]+") do
		count = count + 1
		result[count] = str
	end
	return result
end

-- Object static functions

function TS.Object_keys(object)
	local result = {}
	for key in pairs(object) do
		result[#result + 1] = key
	end
	return result
end

function TS.Object_values(object)
	local result = {}
	for _, value in pairs(object) do
		result[#result + 1] = value
	end
	return result
end

function TS.Object_entries(object)
	local result = {}
	for key, value in pairs(object) do
		result[#result + 1] = {key, value}
	end
	return result
end

function TS.Object_assign(toObj, ...)
	local args = { ... }
	for i = 1, #args do
		for key, value in pairs(args[i]) do
			toObj[key] = value
		end
	end
	return toObj
end

function TS.Roact_combine(...)
    local args = {...}
    local result = {}
    for i = 1, #args do
        for key, value in pairs(args[i]) do
            if (type(key) == "number") then
                table.insert(result, value)
            else
                result[key] = value
            end
        end
    end
    return result
end

-- Error objects
do
	local errors = setmetatable({}, {__mode = "v"})
	local nextErrorId = 0

	function TS.error(thrown, level)
		if level ~= 0 then
			level = (level or 1) + 1
		end

		nextErrorId = nextErrorId + 1

		local id = nextErrorId

		errors[id] = thrown
		error("[<[" .. id .. "]>] " .. tostring(thrown), level)
	end

	function TS.decodeError(errorMessage)
		local result
		local key = errorMessage:match("%[%<%[(.-)%]%>%]")
		if key ~= nil then
			result = errors[tonumber(key)]
		end
		return result or errorMessage
	end
end

return TS
