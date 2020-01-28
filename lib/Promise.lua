--[[
	An implementation of Promises similar to Promise/A+.
	Forked from LPGhatguy/roblox-lua-promise, modified for roblox-ts.
]]

local PROMISE_DEBUG = false

--[[
	Packs a number of arguments into a table and returns its length.

	Used to cajole varargs without dropping sparse values.
]]
local function pack(...)
	local len = select("#", ...)

	return len, { ... }
end

--[[
	wpcallPacked is a version of xpcall that:
	* Returns the length of the result first
	* Returns the result packed into a table
	* Passes extra arguments through to the passed function; xpcall doesn't
	* Issues a warning if PROMISE_DEBUG is enabled
]]
local function wpcallPacked(f, ...)
	local argsLength, args = pack(...)

	local body = function()
		return f(unpack(args, 1, argsLength))
	end

	local resultLength, result = pack(xpcall(body, debug.traceback))

	-- If promise debugging is on, warn whenever a pcall fails.
	-- This is useful for debugging issues within the Promise implementation
	-- itself.
	if PROMISE_DEBUG and not result[1] then
		warn(result[2])
	end

	return resultLength, result
end

--[[
	Creates a function that invokes a callback with correct error handling and
	resolution mechanisms.
]]
local function createAdvancer(callback, resolve, reject)
	return function(...)
		local resultLength, result = wpcallPacked(callback, ...)
		local ok = result[1]

		if ok then
			resolve(unpack(result, 2, resultLength))
		else
			reject(unpack(result, 2, resultLength))
		end
	end
end

local function isEmpty(t)
	return next(t) == nil
end

local function createSymbol(name)
	assert(type(name) == "string", "createSymbol requires `name` to be a string.")

	local symbol = newproxy(true)

	getmetatable(symbol).__tostring = function()
		return ("Symbol(%s)"):format(name)
	end

	return symbol
end

local PromiseMarker = createSymbol("PromiseMarker")

local Promise = {}
Promise.prototype = {}
Promise.__index = Promise.prototype

Promise.Status = {
	Started = createSymbol("Started"),
	Resolved = createSymbol("Resolved"),
	Rejected = createSymbol("Rejected"),
	Cancelled = createSymbol("Cancelled"),
}

--[[
	Constructs a new Promise with the given initializing callback.

	This is generally only called when directly wrapping a non-promise API into
	a promise-based version.

	The callback will receive 'resolve' and 'reject' methods, used to start
	invoking the promise chain.

	For example:

		local function get(url)
			return Promise.new(function(resolve, reject)
				spawn(function()
					resolve(HttpService:GetAsync(url))
				end)
			end)
		end

		get("https://google.com")
			:andThen(function(stuff)
				print("Got some stuff!", stuff)
			end)

	Second parameter, parent, is used internally for tracking the "parent" in a
	promise chain. External code shouldn't need to worry about this.
]]
function Promise.new(callback, parent)
	if parent ~= nil and not Promise.is(parent) then
		error("Argument #2 to Promise.new must be a promise or nil", 2)
	end

	local self = {
		-- Used to locate where a promise was created
		_source = debug.traceback(),

		-- A tag to identify us as a promise
		[PromiseMarker] = true,

		_status = Promise.Status.Started,

		-- A table containing a list of all results, whether success or failure.
		-- Only valid if _status is set to something besides Started
		_values = nil,

		-- Lua doesn't like sparse arrays very much, so we explicitly store the
		-- length of _values to handle middle nils.
		_valuesLength = -1,

		-- If an error occurs with no observers, this will be set.
		_unhandledRejection = false,

		-- Queues representing functions we should invoke when we update!
		_queuedResolve = {},
		_queuedReject = {},
		_queuedFinally = {},

		-- The function to run when/if this promise is cancelled.
		_cancellationHook = nil,

		-- The "parent" of this promise in a promise chain. Required for
		-- cancellation propagation.
		_parent = parent,

		-- The number of consumers attached to this promise. This is needed so that
		-- we don't propagate promise cancellations when there are still uncancelled
		-- consumers.
		_numConsumers = 0,
	}

	setmetatable(self, Promise)

	local function resolve(...)
		self:_resolve(...)
	end

	local function reject(...)
		self:_reject(...)
	end

	local function onCancel(cancellationHook)
		assert(type(cancellationHook) == "function", "onCancel must be called with a function as its first argument.")

		if self._status == Promise.Status.Cancelled then
			cancellationHook()
		else
			self._cancellationHook = cancellationHook
		end
	end

	local _, result = wpcallPacked(callback, resolve, reject, onCancel)
	local ok = result[1]
	local err = result[2]

	if not ok and self._status == Promise.Status.Started then
		reject(err)
	end

	return self
end

--[[
	Fast spawn: Spawns a thread with predictable timing.
	Runs immediately instead of first cycle being deferred.
]]
function Promise.spawn(callback, ...)
	local spawnBindable = Instance.new("BindableEvent")
	local args = { ... }
	local length = select("#", ...)
	spawnBindable.Event:Connect(function()
		callback(unpack(args, 1, length))
	end)
	spawnBindable:Fire()
	spawnBindable:Destroy()
end

--[[
	Create a promise that represents the immediately resolved value.
]]
function Promise.resolve(value)
	return Promise.new(function(resolve)
		resolve(value)
	end)
end

--[[
	Create a promise that represents the immediately rejected value.
]]
function Promise.reject(value)
	return Promise.new(function(_, reject)
		reject(value)
	end)
end

--[[
	Returns a new promise that:
		* is resolved when all input promises resolve
		* is rejected if ANY input promises reject
]]
function Promise.all(promises)
	if type(promises) ~= "table" then
		error("Please pass a list of promises to Promise.all", 2)
	end

	-- If there are no values then return an already resolved promise.
	if #promises == 0 then
		return Promise.resolve({})
	end

	-- We need to check that each value is a promise here so that we can produce
	-- a proper error rather than a rejected promise with our error.
	for i = 1, #promises do
		if not Promise.is(promises[i]) then
			error(("Non-promise value passed into Promise.all at index #%d"):format(i), 2)
		end
	end

	return Promise.new(function(resolve, reject)
		-- An array to contain our resolved values from the given promises.
		local resolvedValues = {}

		-- Keep a count of resolved promises because just checking the resolved
		-- values length wouldn't account for promises that resolve with nil.
		local resolvedCount = 0

		-- Called when a single value is resolved and resolves if all are done.
		local function resolveOne(i, ...)
			resolvedValues[i] = ...
			resolvedCount = resolvedCount + 1

			if resolvedCount == #promises then
				resolve(resolvedValues)
			end
		end

		-- We can assume the values inside `promises` are all promises since we
		-- checked above.
		for i = 1, #promises do
			promises[i]:andThen(
				function(...)
					resolveOne(i, ...)
				end,
				function(...)
					reject(...)
				end
			)
		end
	end)
end

--[[
	Is the given object a Promise instance?
]]
function Promise.is(object)
	if type(object) ~= "table" then
		return false
	end

	return object[PromiseMarker] == true
end

function Promise.prototype:getStatus()
	return self._status
end

function Promise.prototype:isRejected()
	return self._status == Promise.Status.Rejected
end

function Promise.prototype:isResolved()
	return self._status == Promise.Status.Resolved
end

function Promise.prototype:isPending()
	return self._status == Promise.Status.Started
end

function Promise.prototype:isCancelled()
	return self._status == Promise.Status.Cancelled
end

--[[
	Creates a new promise that receives the result of this promise.

	The given callbacks are invoked depending on that result.
]]
function Promise.prototype:andThen(successHandler, failureHandler)
	self._unhandledRejection = false
	self._numConsumers = self._numConsumers + 1

	-- Create a new promise to follow this part of the chain
	return Promise.new(function(resolve, reject)
		-- Our default callbacks just pass values onto the next promise.
		-- This lets success and failure cascade correctly!

		local successCallback = resolve
		if successHandler then
			successCallback = createAdvancer(successHandler, resolve, reject)
		end

		local failureCallback = reject
		if failureHandler then
			failureCallback = createAdvancer(failureHandler, resolve, reject)
		end

		if self._status == Promise.Status.Started then
			-- If we haven't resolved yet, put ourselves into the queue
			table.insert(self._queuedResolve, successCallback)
			table.insert(self._queuedReject, failureCallback)
		elseif self._status == Promise.Status.Resolved then
			-- This promise has already resolved! Trigger success immediately.
			successCallback(unpack(self._values, 1, self._valuesLength))
		elseif self._status == Promise.Status.Rejected then
			-- This promise died a terrible death! Trigger failure immediately.
			failureCallback(unpack(self._values, 1, self._valuesLength))
		elseif self._status == Promise.Status.Cancelled then
			-- We don't want to call the success handler or the failure handler,
			-- we just reject this promise outright.
			reject("Promise is cancelled")
		end
	end, self)
end

--[[
	Used to catch any errors that may have occurred in the promise.
]]
function Promise.prototype:catch(failureCallback)
	return self:andThen(nil, failureCallback)
end

--[[
	Cancels the promise, disallowing it from rejecting or resolving, and calls
	the cancellation hook if provided.
]]
function Promise.prototype:cancel()
	if self._status ~= Promise.Status.Started then
		return
	end

	self._status = Promise.Status.Cancelled

	if self._cancellationHook then
		self._cancellationHook()
	end

	if self._parent then
		self._parent:_consumerCancelled()
	end

	self:_finalize()
end

--[[
	Used to decrease the number of consumers by 1, and if there are no more,
	cancel this promise.
]]
function Promise.prototype:_consumerCancelled()
	self._numConsumers = self._numConsumers - 1

	if self._numConsumers <= 0 then
		self:cancel()
	end
end

--[[
	Used to set a handler for when the promise resolves, rejects, or is
	cancelled. Returns a new promise chained from this promise.
]]
function Promise.prototype:finally(finallyHandler)
	self._numConsumers = self._numConsumers + 1

	-- Return a promise chained off of this promise
	return Promise.new(function(resolve, reject)
		local finallyCallback = resolve
		if finallyHandler then
			finallyCallback = createAdvancer(finallyHandler, resolve, reject)
		end

		if self._status == Promise.Status.Started then
			-- The promise is not settled, so queue this.
			table.insert(self._queuedFinally, finallyCallback)
		else
			-- The promise already settled or was cancelled, run the callback now.
			finallyCallback()
		end
	end, self)
end

--[[
	Yield until the promise is completed.

	This matches the execution model of normal Roblox functions.
]]
function Promise.prototype:await()
	self._unhandledRejection = false

	if self._status == Promise.Status.Started then
		local result
		local resultLength
		local bindable = Instance.new("BindableEvent")

		self:andThen(
			function(...)
				resultLength, result = pack(...)
				bindable:Fire(true)
			end,
			function(...)
				resultLength, result = pack(...)
				bindable:Fire(false)
			end
		)
		self:finally(function()
			bindable:Fire(nil)
		end)

		local ok = bindable.Event:Wait()
		bindable:Destroy()

		if ok == nil then
			-- If cancelled, we return nil.
			return nil
		end

		return ok, unpack(result, 1, resultLength)
	elseif self._status == Promise.Status.Resolved then
		return true, unpack(self._values, 1, self._valuesLength)
	elseif self._status == Promise.Status.Rejected then
		return false, unpack(self._values, 1, self._valuesLength)
	end

	-- If the promise is cancelled, fall through to nil.
	return nil
end

--[[
	Intended for use in tests.

	Similar to await(), but instead of yielding if the promise is unresolved,
	_unwrap will throw. This indicates an assumption that a promise has
	resolved.
]]
function Promise.prototype:_unwrap()
	if self._status == Promise.Status.Started then
		error("Promise has not resolved or rejected.", 2)
	end

	local success = self._status == Promise.Status.Resolved

	return success, unpack(self._values, 1, self._valuesLength)
end

function Promise.prototype:_resolve(...)
	if self._status ~= Promise.Status.Started then
		return
	end

	-- If the resolved value was a Promise, we chain onto it!
	if Promise.is((...)) then
		-- Without this warning, arguments sometimes mysteriously disappear
		if select("#", ...) > 1 then
			local message = (
				"When returning a Promise from andThen, extra arguments are " ..
				"discarded! See:\n\n%s"
			):format(
				self._source
			)
			warn(message)
		end

		(...):andThen(
			function(...)
				self:_resolve(...)
			end,
			function(...)
				self:_reject(...)
			end
		)

		return
	end

	self._status = Promise.Status.Resolved
	self._valuesLength, self._values = pack(...)

	-- We assume that these callbacks will not throw errors.
	for _, callback in ipairs(self._queuedResolve) do
		callback(...)
	end

	self:_finalize()
end

function Promise.prototype:_reject(...)
	if self._status ~= Promise.Status.Started then
		return
	end

	self._status = Promise.Status.Rejected
	self._valuesLength, self._values = pack(...)

	-- If there are any rejection handlers, call those!
	if not isEmpty(self._queuedReject) then
		-- We assume that these callbacks will not throw errors.
		for _, callback in ipairs(self._queuedReject) do
			callback(...)
		end
	else
		-- At this point, no one was able to observe the error.
		-- An error handler might still be attached if the error occurred
		-- synchronously. We'll wait one tick, and if there are still no
		-- observers, then we should put a message in the console.

		self._unhandledRejection = true
		local err = tostring((...))

		spawn(function()
			-- Someone observed the error, hooray!
			if not self._unhandledRejection then
				return
			end

			-- Build a reasonable message
			local message = ("Unhandled promise rejection:\n\n%s\n\n%s"):format(
				err,
				self._source
			)
			warn(message)
		end)
	end

	self:_finalize()
end

--[[
	Calls any :finally handlers. We need this to be a separate method and
	queue because we must call all of the finally callbacks upon a success,
	failure, *and* cancellation.
]]
function Promise.prototype:_finalize()
	for _, callback in ipairs(self._queuedFinally) do
		-- Purposefully not passing values to callbacks here, as it could be the
		-- resolved values, or rejected errors. If the developer needs the values,
		-- they should use :andThen or :catch explicitly.
		callback()
	end
end

return Promise
