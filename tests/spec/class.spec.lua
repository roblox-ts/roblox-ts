return function()
  local out = game:GetService("ReplicatedStorage").Tests.out

  local class = require(out.class)

  it("should create a class with a constructor", function()
    local boi = class.Greeter.new("boi")

    expect(boi.greeting).to.equal("boi")
  end)

  it("should expose a public function", function()
    local artemis = class.Greeter.new("artemis")

    expect(artemis.greeting).to.equal("artemis")
    expect(artemis:greet()).to.equal("Hello, artemis")
  end)

  it("should inhereit functions", function()
    local apollo = class.Dog.new("apollo")

    expect(apollo:move()).to.equal("Animal moved 0m.")
    expect(apollo:move(5)).to.equal("Animal moved 5m.")
    expect(apollo:bark()).to.equal("apollo barks")
  end)
end
