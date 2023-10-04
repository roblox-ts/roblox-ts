-- not 100% accurate to tick() functionality, but good enough for TestEZ usage
local function tick()
	return os.clock()
end

return tick
