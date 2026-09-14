-- Luau lets the guard tests seed _G without casts around roblox-ts' opaque typing

return function()
	local ReplicatedStorage = game:GetService("ReplicatedStorage")

	local include = ReplicatedStorage:FindFirstChild("include")
	assert(include, "Unable to find include folder")
	local runtimeLibModule = include:FindFirstChild("RuntimeLib")
	assert(runtimeLibModule, "Unable to find RuntimeLib")

	local TS = require(runtimeLibModule)
	local runtimeScript = TS.__runtimeScript
	assert(runtimeScript ~= nil, "RuntimeLib did not expose __runtimeScript")

	local function fixture(name: string)
		-- requiring the clone returns the spec function without running its tests
		local module = script:Clone()
		module.Name = name
		return module
	end

	it("tolerates re-registration by the same runtime", function()
		local module = fixture("sameRuntime")
		-- stand in for a prior runtime table left by the same RuntimeLib script
		_G[module] = { __runtimeScript = runtimeScript }

		expect(function()
			TS.import(script, module)
		end).never.to.throw()
	end)

	it("rejects a module owned by a different runtime", function()
		local module = fixture("differentRuntime")
		TS.import(script, module)
		local otherRuntimeModule = runtimeLibModule:Clone()
		otherRuntimeModule.Name = "OtherRuntimeLib"
		otherRuntimeModule.Parent = include
		local otherRuntime = require(otherRuntimeModule)
		otherRuntimeModule:Destroy()

		expect(function()
			otherRuntime.import(script, module)
		end).to.throw("multiple TS runtimes")
		expect(_G[module]).to.equal(TS)
	end)

	it("rejects untagged and non-table _G owners", function()
		local module = fixture("nonTableOwner")
		for _, owner in { {}, true, false, "invalid", 42 } do
			_G[module] = owner
			expect(function()
				TS.import(script, module)
			end).to.throw("multiple TS runtimes")
			expect(_G[module]).to.equal(owner)
		end
	end)

	it("preserves cached runtime and package identity", function()
		local module = fixture("cachedRuntime")
		local packageModule = TS.import(script, module)
		expect(require(runtimeLibModule)).to.equal(TS)
		expect(TS.import(script, module)).to.equal(packageModule)
	end)
end
