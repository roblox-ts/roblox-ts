local Promise = require(script.Parent.Promise)

local HttpService = game:GetService("HttpService")

-- constants
local TYPE_NIL = "nil"
local TYPE_STRING = "string"
local TYPE_TABLE = "table"
local TYPE_USERDATA = "userdata"
local TYPE_FUNCTION = "function"

local quicksort = table.sort
local math_ceil = math.ceil
local math_floor = math.floor

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

-- This is a hash which TS.import uses as a kind of linked-list-like history of [Script who Loaded] -> Library
local loadedLibraries = {}
local currentlyLoading = {}

function TS.import(module, ...)
	for i = 1, select("#", ...) do
		module = module:WaitForChild((select(i, ...)))
	end

	if module.ClassName == "ModuleScript" then
		local data = loadedLibraries[module]

		if data == nil then
			-- If called from command bar, use table as a reference (this is never concatenated)
			local caller = getfenv(0).script or { Name = "Command bar" }
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
						str = str .. " -> " .. currentModule.Name
					end

					error("Failed to import! Detected a circular dependency chain: " .. str, 2)
				end
			end

			data = require(module)

			if currentlyLoading[caller] == module then -- Thread-safe cleanup!
				currentlyLoading[caller] = nil
			end

			loadedLibraries[module] = data -- Cache for subsequent calls
		end

		return data
	else
		error("Failed to import! Expected ModuleScript, got " .. module.ClassName, 2)
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
	if type == TYPE_TABLE or type == TYPE_USERDATA then
		return "object"
	elseif type == TYPE_NIL then
		return "undefined"
	else
		return type
	end
end

function TS.typeIs(value, typeName)
	return typeof(value) == typeName
end

function TS.instanceof(obj, class)
	-- custom Class.instanceof() check
	if typeof(class) == TYPE_TABLE and typeof(class.instanceof) == TYPE_FUNCTION then
		return class.instanceof(obj)
	end

	-- metatable check
	if typeof(obj) == TYPE_TABLE then
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
		TS.throw(ok == nil and "The awaited Promise was cancelled" or result)
	end
end

function TS.add(a, b)
	if typeof(a) == TYPE_STRING or typeof(b) == TYPE_STRING then
		return a .. b
	else
		return a + b
	end
end

local function bitTruncate(a)
	if a < 0 then
		return math_ceil(a)
	else
		return math_floor(a)
	end
end

TS.round = bitTruncate
TS.bitTruncate = bitTruncate

-- bitwise operations
local powOfTwo = setmetatable({}, {
	__index = function(self, i)
		local v = 2 ^ i
		self[i] = v
		return v
	end;
})

local _2_52 = powOfTwo[52]
local function bitop(a, b, oper)
	local r, m, s = 0, _2_52
	repeat
		s, a, b = a + b + m, a % m, b % m
		r, m = r + m * oper % (s - a - b), m / 2
	until m < 1
	return r
end

function TS.bor(a, b)
	a = bitTruncate(tonumber(a))
	b = bitTruncate(tonumber(b))
	return bitop(a, b, 1)
end

function TS.band(a, b)
	a = bitTruncate(tonumber(a))
	b = bitTruncate(tonumber(b))
	return bitop(a, b, 4)
end

function TS.bxor(a, b)
	a = bitTruncate(tonumber(a))
	b = bitTruncate(tonumber(b))
	return bitop(a, b, 3)
end

function TS.blsh(a, b)
	a = bitTruncate(tonumber(a))
	b = bitTruncate(tonumber(b))
	return a * powOfTwo[b]
end

function TS.brsh(a, b)
	a = bitTruncate(tonumber(a))
	b = bitTruncate(tonumber(b))
	return bitTruncate(a / powOfTwo[b])
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

function TS.Object_isEmpty(object)
	return next(object) == nil
end

function TS.Object_toString(list)
	return HttpService:JSONEncode(list)
end

-- array macro functions

function TS.array_forEach(list, callback)
	for i = 1, #list do
		local v = list[i]
		if v ~= nil then
			callback(v, i - 1, list)
		end
	end
end

function TS.array_map(list, callback)
	local result = {}
	for i = 1, #list do
		local v = list[i]
		if v ~= nil then
			result[i] = callback(v, i - 1, list)
		end
	end
	return result
end

function TS.array_filter(list, callback)
	local result = {}
	for i = 1, #list do
		local v = list[i]
		if v ~= nil and callback(v, i - 1, list) == true then
			result[#result + 1] = v
		end
	end
	return result
end

local function sortFallback(a, b)
	return tostring(a) < tostring(b)
end

function TS.array_sort(list, callback)
	local n = #list
	local sorted

	if n < 8000 then
		sorted = {unpack(list)}
	else
		sorted = {}
		for i = 1, n do
			sorted[i] = list[i]
		end
	end

	if callback then
		quicksort(sorted, function(a, b)
			return 0 < callback(a, b)
		end)
	else
		quicksort(sorted, sortFallback)
	end

	return sorted
end

TS.array_toString = TS.Object_toString

function TS.array_slice(list, startI, endI)
	local length = #list
	if startI == nil then
		startI = 0
	end
	if endI == nil then
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
	if start < 0 then
		actualStart = len + start
		if actualStart < 0 then
			actualStart = 0
		end
	else
		if start < len then
			actualStart = start
		else
			actualStart = len
		end
	end
	local items = { ... }
	local itemCount = #items
	local actualDeleteCount
	if start == nil then
		actualDeleteCount = 0
	elseif deleteCount == nil then
		actualDeleteCount = len - actualStart
	else
		if deleteCount < 0 then
			deleteCount = 0
		end
		actualDeleteCount = len - actualStart
		if deleteCount < actualDeleteCount then
			actualDeleteCount = deleteCount
		end
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
		local v = list[i]
		if v ~= nil and callback(v, i - 1, list) == true then
			return true
		end
	end
	return false
end

function TS.array_every(list, callback)
	for i = 1, #list do
		local v = list[i]
		if v ~= nil and callback(v, i - 1, list) == false then
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
	local n = length + 1
	for i = 1, length do
		result[i] = list[n - i]
	end
	return result
end

function TS.array_reduce(list, callback, initialValue)
	local start = 1
	if initialValue == nil then
		initialValue = list[start]
		start = 2
	end
	local accumulator = initialValue
	for i = start, #list do
		local v = list[i]
		if v ~= nil then
			accumulator = callback(accumulator, v, i)
		end
	end
	return accumulator
end

function TS.array_reduceRight(list, callback, initialValue)
	local start = #list
	if initialValue == nil then
		initialValue = list[start]
		start = start - 1
	end
	local accumulator = initialValue
	for i = start, 1, -1 do
		local v = list[i]
		if v ~= nil then
			accumulator = callback(accumulator, v, i)
		end
	end
	return accumulator
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
	return #list
end

function TS.array_pop(list)
	local length = #list
	local lastValue = list[length]
	list[length] = nil
	return lastValue
end

local table_concat = table.concat

function TS.array_join(list, separator)
	local result = {}
	for i = 1, #list do
		result[i] = tostring(list[i])
	end
	return table_concat(result, separator or ", ")
end

function TS.array_find(list, callback)
	for i = 1, #list do
		local v = list[i]
		if callback(v, i - 1, list) == true then
			return v
		end
	end
end

function TS.array_findIndex(list, callback)
	for i = 0, #list - 1 do
		if callback(list[i + 1], i, list) == true then
			return i
		end
	end
	return -1
end

local function array_flat_helper(list, depth, count, result)
	for i = 1, #list do
		local v = list[i]

		if v ~= nil then
			if type(v) == "table" then
				if depth ~= 0 then
					count = array_flat_helper(v, depth - 1, count, result)
				else
					count = count + 1
					result[count] = v
				end
			else
				count = count + 1
				result[count] = v
			end
		end
	end

	return count
end

function TS.array_flat(list, depth)
	local result = {}
	array_flat_helper(list, depth or 1, 0, result)
	return result
end

function TS.array_fill(list, value, from, to)
	local length = #list

	if from == nil then
		from = 0
	elseif from < 0 then
		from = from + length
	end

	if to == nil or to > length then
		to = length
	elseif to < 0 then
		to = to + length
	end

	for i = from + 1, to do
		list[i] = value
	end

	return list
end

function TS.array_copyWithin(list, target, from, to)
	local length = #list

	if target < 0 then
		target = target + length
	end

	if from == nil then
		from = 0
	elseif from < 0 then
		from = from + length
	end

	if to == nil or to > length then
		to = length
	elseif to < 0 then
		to = to + length
	end

	local tf = target - from
	local overshoot = to + tf - length

	if overshoot > 0 then
		to = from + length - target
	end

	for i = to, from + 1, -1 do
		list[i + tf] = list[i]
	end

	return list
end

TS.array_isEmpty = TS.Object_isEmpty

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

TS.map_toString = TS.array_toString
TS.map_isEmpty = TS.Object_isEmpty

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

TS.set_isEmpty = TS.Object_isEmpty
TS.set_toString = TS.array_toString

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

-- roact functions

function TS.Roact_combine(...)
	local args = { ... }
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

-- try catch utilities

local function pack(...)
	local result = { ... }
	result.size = select("#", ...)
	return result
end

local throwStack = {}

function TS.throw(value)
	if #throwStack > 0 then
		throwStack[#throwStack](value)
	else
		error("Uncaught " .. tostring(value), 2)
	end
end

function TS.try(tryCallback, catchCallback)
	local done = false
	local yielded = false
	local popped = false
	local resumeThread = coroutine.running()

	local returns

	local function pop()
		if not popped then
			popped = true
			throwStack[#throwStack] = nil
		end
	end

	local function resume()
		if yielded then
			local success, errorMsg = coroutine.resume(resumeThread)
			if not success then
				warn(errorMsg)
			end
		else
			done = true
		end
	end

	local function throw(value)
		pop()
		if catchCallback then
			returns = pack(catchCallback(value))
		end
		resume()
		coroutine.yield()
	end

	throwStack[#throwStack + 1] = throw

	coroutine.wrap(function()
		returns = pack(tryCallback())
		resume()
	end)()

	if not done then
		yielded = true
		coroutine.yield()
	end

	pop()

	return returns
end

return TS
