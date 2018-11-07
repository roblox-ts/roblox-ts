// Basic tests
class Greeter {
	public greeting: string;

	constructor(message: string) {
		this.greeting = message;
	}

	public greet() {
		return "Hello, " + this.greeting;
	}
}

// Inheritence
class Animal {
	public move(distanceInMeters: number = 0) {
		return `Animal moved ${distanceInMeters}m.`;
	}
}

class Dog extends Animal {
	private name: string;

	constructor(name: string) {
		super();
		this.name = name;
	}

	public bark() {
		return this.name + " barks";
	}
}

export = () => {
	it("should create a class with a constructor", () => {
		const boi = new Greeter("boi");
		expect(boi.greeting).to.equal("boi");
	});

	it("should expose a public function", () => {
		const artemis = new Greeter("artemis");
		expect(artemis.greeting).to.equal("artemis");
		expect(artemis.greet()).to.equal("Hello, artemis");
	});

	it("should inhereit functions", () => {
		const apollo = new Dog("apollo");
		expect(apollo.move()).to.equal("Animal moved 0m.");
		expect(apollo.move(5)).to.equal("Animal moved 5m.");
		expect(apollo.bark()).to.equal("apollo barks");
	});
};
