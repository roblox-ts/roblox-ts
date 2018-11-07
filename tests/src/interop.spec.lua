local module = require(script.Parent.module);

return function()
	it("should allow Lua interop", function()
		expect(module.foo()).to.equal("bar");
	end)
end