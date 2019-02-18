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

	it("should expose a public method", () => {
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

	it("should inhereit methods", () => {
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

	it("should support static methods", () => {
		class Foo {
			static bar() {
				return "bar";
			}
		}
		expect(Foo.bar()).to.equal("bar");
	});

	it("should inherit static methods", () => {
		class Foo {
			static bar() {
				return "bar";
			}
		}

		class Bar extends Foo {}
		expect(Bar.bar()).to.equal("bar");
	});

	it("should support parameter initializers", () => {
		class Foo {
			public bar = "baz";
		}
		const foo = new Foo();
		expect(foo.bar).to.equal("baz");
	});

	it("should support getters", () => {
		class Foo {
			get bar() {
				return "baz";
			}
		}
		expect(new Foo().bar).to.equal("baz");
	});

	it("should support setters", () => {
		class Foo {
			private baz = "";
			set bar(value: string) {
				this.baz = value;
			}
			get bar() {
				return this.baz;
			}
		}
		const foo = new Foo();
		foo.bar = "a";
		expect(foo.bar).to.equal("a");
		foo.bar = "b";
		expect(foo.bar).to.equal("b");
	});

	it("should support __tostring", () => {
		class Foo {
			public __tostring() {
				return "Foo";
			}
		}
		expect(tostring(new Foo())).to.equal("Foo");
	});

	it("should support __tostring inheritance", () => {
		class Foo {
			public __tostring() {
				return "Foo";
			}
		}

		class Bar extends Foo {}
		expect(tostring(new Bar())).to.equal("Foo");
	});

	it("should support multiple constructors", () => {
		class Foo {
			public name: string | undefined;
			constructor();
			constructor(name: string);
			constructor(name?: string) {
				if (name) {
					this.name = name;
				}
			}
		}
		const foo1 = new Foo();
		expect(foo1.name).never.to.be.ok();
		const foo2 = new Foo("bar");
		expect(foo2.name).to.equal("bar");
	});

	it("should support constructor parameter destructuring", () => {
		class Foo {
			bar: number;
			constructor({ a }: { a: number }) {
				this.bar = a;
			}
		}
		expect(new Foo({ a: 123 }).bar).to.equal(123);
	});

	it("should support super method calls", () => {
		class Foo {
			baz() {
				return "A";
			}
		}

		class Bar extends Foo {
			baz() {
				return super.baz() + "B";
			}
		}

		const bar = new Bar();
		expect(bar.baz()).to.equal("AB");
	});

	it("should support class expressions", () => {
		const Foo = class {
			bar() {
				return "A";
			}
		};
		const Bar = class extends Foo {};
		const bar = new Bar();
		expect(bar.bar()).to.equal("A");
	});

	it("should support built-in classes", () => {
		expect(new Promise(() => {})).to.be.ok();
	});

	it("should support numeric members", () => {
		class Foo {
			1 = "bar";
		}
		expect(new Foo()[1]).to.equal("bar");
	});

	it("should support computed members", () => {
		class Foo {
			["bar"] = "baz";
		}
		expect(new Foo()["bar"]).to.equal("baz");
	});

	it("should support numeric statics", () => {
		class Foo {
			static 1 = "bar";
		}
		expect(Foo[1]).to.equal("bar");
	});

	it("should support computed statics", () => {
		class Foo {
			static ["bar"] = "baz";
		}
		expect(Foo["bar"]).to.equal("baz");
	});

	it("should support new expressions without parentheses", () => {
		class Foo {
			bar = 1;
		}
		// prettier-ignore
		const foo = new Foo;
		expect(foo).to.be.ok();
		expect(foo instanceof Foo).to.equal(true);
		expect(foo.bar).to.equal(1);
	});
};
