return function()
  local out = game:GetService("ReplicatedStorage").Tests.out

  local math = require(out.math)

  it("should add two numbers", function()
    expect(math.sum(1, 5)).to.equal(6)
    expect(math.sum(22, 44)).to.equal(66)
  end)

  it("should divide two numbers", function()
    expect(math.divide(6, 3)).to.equal(2)
    expect(math.divide(22, 44)).to.equal(0.5)
  end)
end
