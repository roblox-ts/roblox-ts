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

			async f() {}
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

			static async barf() {
				return "barf";
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

	it("should support toString", () => {
		class Foo {
			public toString() {
				return "Foo";
			}
		}
		expect(tostring(new Foo())).to.equal("Foo");
	});

	it("should support toString inheritance", () => {
		class Foo {
			public toString() {
				return "Foo";
			}
		}

		class Bar extends Foo {}
		expect(tostring(new Bar())).to.equal("Foo");
	});

	it("should support toString inheritance with ClassExpression", () => {
		class A extends class B {
			toString() {
				return "B";
			}
		} {}
		expect(tostring(new A())).to.equal("B");
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

		class A<T> extends Array<T> {
			constructor(s: string = "") {
				expect(super()).to.equal(undefined);
			}
		}

		class B<T> extends A<T> {
			constructor() {
				expect(super("hey")).to.equal(undefined);
			}
		}

		class C extends class {} {
			constructor() {
				expect(super()).to.equal(undefined);
			}
		}

		const a = new A();
		const b = new B();
		const c = new C();
	});

	it("should support passing the rest parameter from constructor to super", () => {
		class A {
			constructor(...rest: unknown[]) {
				expect(rest[0]).to.equal(10);
				expect(rest[1]).to.equal(20);
				expect(rest[2]).to.equal(30);
			}
		}

		class B extends A {
			constructor(...rest: unknown[]) {
				super(...rest);
			}
		}

		expect(() => new B(10, 20, 30)).never.throw();
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

	it("should support computed element access methods", () => {
		let i = 0;
		new (class Boat extends class Goat {
			[key: number]: () => number;
			[Symbol.iterator]() {}
		} {
			public f(s: string, b?: boolean) {
				this[i] = () => 10;
				expect(this[i]()).to.equal(10);
			}
		})().f("Go!");
	});

	it("should support Symbol.iterator", () => {
		let i = 0;
		for (const foo of new (class A extends class B {
			*[Symbol.iterator]() {
				yield 1;
				yield 2;
				yield 3;
			}
		} {})()) {
			expect(foo).to.equal(++i);
		}
	});

	it("should support extending from Array", () => {
		/** A very bad implementation of a SortedArray class. Just for testing purposes. */
		class SortedArray extends Array<number> {
			constructor(arr?: ReadonlyArray<number>) {
				super();
				if (arr) {
					super.push(...[...arr].sort());
				}
			}
			public unshift() {
				return error("Bad!");
			}

			public push(...args: Array<number>) {
				let size = this.size();
				for (const arg of args) {
					// insert each element in place.
					const index = this.findIndex(element => element > arg);
					this.insert(index === -1 ? size : index, arg);
					size++;
				}
				return size;
			}
		}

		const sorted = new SortedArray([3, 2, 5, 6, 1]);
		expect(sorted.push(7, 0, 4)).to.equal(8);
		for (const [i, x] of sorted.entries()) {
			expect(i).to.equal(x);
		}
		expect(sorted.pop()).to.equal(7);
		expect(() => sorted.unshift()).to.throw();

		let i = 0;
		expect(
			new (class extends class extends Array<number> {
				public x = i++;
			} {
				public x = i++;
			})().x,
		).to.equal(1);
		expect(i).to.equal(2);
	});

	it("should compile static fields last", () => {
		class Foo {
			static x = new Foo().bar();
			bar() {
				return "baz";
			}
		}
		expect(Foo.x).to.equal("baz");
	});

	it("should support invalid indexing", () => {
		expect(
			new (class A {
				public $() {
					return ++this.$v;
				}
				public $v = 2;
			})().$(),
		).to.equal(3);

		expect(
			class {
				public static $() {
					return ++this.$v;
				}
				public static $v = 2;
			}.$(),
		).to.equal(3);

		expect(
			new (class extends class {
				public $v = -1;
				public $() {
					return ++this.$v;
				}
			} {
				public $() {
					return super.$();
				}
			})().$(),
		).to.equal(0);

		expect(
			class extends class {
				public static $v = -1;
				public static $() {
					return ++this.$v;
				}
			} {
				public static $() {
					return super.$();
				}
			}.$(),
		).to.equal(0);
	});
};
