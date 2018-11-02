return function()
  local out = game:GetService("ReplicatedStorage").Tests.out

  local math = require(out.math)

  it("should add two numbers", function()
    local sum = math.sum(1, 5)

    expect(sum).to.equal(6)
  end)
end
