// Basic tests
export class Greeter {
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

export class Dog extends Animal {
	private name: string;

	constructor(name: string) {
		super();
		this.name = name;
	}

	public bark() {
		return this.name + " barks";
	}
}
