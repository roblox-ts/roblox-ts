export = () => {
	it("should create a class with a constructor", () => {
		class Foo {
			public bar: string;
			constructor(bar: string) {
				this.bar = bar;
			}
		}

		const foo = new Foo("baz!");
		expect(foo.bar).to.equal("baz!");
	});

	it("should construct with default parameters and accessors", () => {
		class Vector {
			constructor(public readonly x = 0, public readonly y = 0, public readonly z = 0) {}
		}

		const v0 = new Vector(1, 2, 3);
		expect(v0.x).to.equal(1);
		expect(v0.y).to.equal(2);
		expect(v0.z).to.equal(3);

		const v1 = new Vector();
		expect(v1.x).to.equal(0);
		expect(v1.y).to.equal(0);
		expect(v1.z).to.equal(0);
	});

	it("should expose a public function", () => {
		class Greeter {
			public greeting: string;

			constructor(message: string) {
				this.greeting = message;
			}

			public greet() {
				return "Hello, " + this.greeting;
			}
		}

		const artemis = new Greeter("artemis");
		expect(artemis.greeting).to.equal("artemis");
		expect(artemis.greet()).to.equal("Hello, artemis");
	});

	it("should inhereit functions", () => {
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

		const apollo = new Dog("apollo");
		expect(apollo.move()).to.equal("Animal moved 0m.");
		expect(apollo.move(5)).to.equal("Animal moved 5m.");
		expect(apollo.bark()).to.equal("apollo barks");
	});

	it("should support parameter initializers", () => {
		class Foo {
			public bar = "baz";
		}
		const foo = new Foo();
		expect(foo.bar).to.equal("baz");
	});

	it("should support getters", () => {});
};
