return function()
  local out = game:GetService("ReplicatedStorage").Tests.out

  local enum = require(out.enum)

  it("should expose enums by number", function()
    expect(enum.Fruits[0]).to.equal("Apple")
    expect(enum.Fruits["Orange"]).to.equal(1)
    expect(enum.Fruits[2]).to.equal("Pear")
  end)

  it("should allow overriding indicies", function()
    expect(enum.Breads[5]).to.equal("White")
    expect(enum.Breads["Wheat"]).to.equal(6)
    expect(enum.Breads[0]).never.to.be.ok()
  end)

  it("should allow for string indicies", function()
    -- expect(enum.Soups["TOMATO"]).to.equal("Tomato") See: https://github.com/roblox-ts/roblox-ts/issues/72
    expect(enum.Soups["ChickenNoodle"]).to.equal("CHICKENNOODLE")
  end)
end
