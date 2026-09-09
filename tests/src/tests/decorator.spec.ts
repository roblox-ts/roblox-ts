export = () => {
	it("should support static parameter decorators", () => {
		let buzz: string | undefined;

		function foobar(object: typeof Foo, methodKey: string, paramNum: number) {
			buzz = `${object}${methodKey}${paramNum}`;
		}

		class Foo {
			static bar(
				@foobar
				baz: string,
			) {}
		}

		expect(buzz).to.equal("Foobar0");
	});
	it("should support non-static parameter decorators", () => {
		let buzz: string | undefined;

		function foobar(object: unknown, methodKey: string, paramNum: number) {
			buzz = `${object}${methodKey}${paramNum}`;
		}

		class Foo {
			public bar(
				@foobar
				baz: string,
			) {}
		}

		expect(buzz).to.equal("Foobar0");
	});

	it("should support class decorators", () => {
		let buzz: typeof Foo | undefined;

		function foobar(object: typeof Foo) {
			buzz = object;
		}

		@foobar
		class Foo {}

		expect(buzz).to.equal(Foo);
	});

	it("should support static method decorators", () => {
		let buzz: string | undefined;

		function foobar(object: typeof Foo, methodKey: string) {
			buzz = `${object}${methodKey}`;
		}

		class Foo {
			@foobar
			static bar() {}
		}

		expect(buzz).to.equal("Foobar");
	});

	it("should support non-static method decorators", () => {
		let buzz: string | undefined;

		function foobar(object: unknown, methodKey: string) {
			buzz = `${tostring(object)}${methodKey}`;
		}

		class Foo {
			@foobar
			public bar() {}
		}

		expect(buzz).to.equal("Foobar");
	});

	it("should support computed method decorators", () => {
		const barName = "bar";
		let buzz: string | undefined;

		function foobar(object: unknown, methodKey: string) {
			buzz = `${tostring(object)}${methodKey}`;
		}

		class Foo {
			@foobar
			public [barName]() {}
		}

		expect(buzz).to.equal("Foobar");
	});

	it("should support static property decorators", () => {
		let buzz: string | undefined;

		function foobar(object: typeof Foo, propertyKey: string) {
			buzz = `${object}${propertyKey}`;
		}

		class Foo {
			@foobar
			static bar = "baz";
		}

		expect(buzz).to.equal(`Foobar`);
	});

	it("should support non-static property decorators", () => {
		let buzz: string | undefined;

		function foobar(object: unknown, propertyKey: string) {
			buzz = `${tostring(object)}${propertyKey}`;
		}

		class Foo {
			@foobar
			public bar = "baz";
		}

		expect(buzz).to.equal(`Foobar`);
	});

	it("should support computed property decorators", () => {
		const barName = "bar";
		let buzz: string | undefined;

		function foobar(object: unknown, propertyKey: string) {
			buzz = `${tostring(object)}${propertyKey}`;
		}

		class Foo {
			@foobar
			public [barName] = "baz";
		}

		expect(buzz).to.equal(`Foobar`);
	});

	it("should support constructor parameter decorators", () => {
		let buzz: string | undefined;

		function foobar(object: typeof Foo, _: unknown, paramNum: number) {
			buzz = `${tostring(object)}${paramNum}`;
		}

		class Foo {
			public constructor(
				@foobar
				bar = "baz",
			) {}
		}

		expect(buzz).to.equal(`Foo0`);
	});

	it("should support complex property decorators", () => {
		enum baz {
			buzz = "bizz",
		}
		let bizz: string | undefined;

		function foobar(object: unknown, propertyKey: string) {
			bizz = `${tostring(object)}${propertyKey}`;
		}

		class Foo {
			@foobar
			public [baz.buzz] = "Hello, world!";
		}

		expect(bizz).to.equal("Foobizz");
	});

	it("should support complex decorator ordering", () => {
		interface Event {
			tag: string;
			state: "initialized" | "executed";
		}

		const events = new Array<Event>();

		function makeDecorator(name: string) {
			return (n: number) => {
				const initEvent: Event = { tag: "", state: "initialized" };
				events.push(initEvent);
				return (...args: unknown[]) => {
					const argStr = args
						.filterUndefined()
						.filter(v => !(typeIs(v, "table") && "value" in v)) // filter out method value object args
						.map(tostring)
						.join("_");
					const tag = `${name}_${argStr}_${n}`;
					initEvent.tag = tag;
					events.push({ tag, state: "executed" });
				};
			};
		}

		const classDecorator = makeDecorator("class");
		const methodDecorator = makeDecorator("method");
		const staticMethodDecorator = makeDecorator("staticMethod");
		const propertyDecorator = makeDecorator("property");
		const staticPropertyDecorator = makeDecorator("staticProperty");
		const parameterDecorator = makeDecorator("parameter");
		const staticParameterDecorator = makeDecorator("staticParameter");
		const constructorParameterDecorator = makeDecorator("constructorParameter");

		@classDecorator(1)
		@classDecorator(2)
		@classDecorator(3)
		class Foo {
			constructor(param1: string, param2: string);
			constructor(
				@constructorParameterDecorator(1)
				@constructorParameterDecorator(2)
				@constructorParameterDecorator(3)
				param1: string,
				@constructorParameterDecorator(4)
				@constructorParameterDecorator(5)
				@constructorParameterDecorator(6)
				param2: string,
			) {}

			method(): void;
			@methodDecorator(1)
			@methodDecorator(2)
			@methodDecorator(3)
			method() {}

			static staticMethod(): void;
			@staticMethodDecorator(1)
			@staticMethodDecorator(2)
			@staticMethodDecorator(3)
			static staticMethod() {}

			@propertyDecorator(1)
			@propertyDecorator(2)
			@propertyDecorator(3)
			property = "value";

			@staticPropertyDecorator(1)
			@staticPropertyDecorator(2)
			@staticPropertyDecorator(3)
			static staticProperty = "value";

			methodWithParameters(param1: string, param2: string): void;
			@methodDecorator(1)
			@methodDecorator(2)
			@methodDecorator(3)
			methodWithParameters(
				@parameterDecorator(1)
				@parameterDecorator(2)
				@parameterDecorator(3)
				param1: string,
				@parameterDecorator(4)
				@parameterDecorator(5)
				@parameterDecorator(6)
				param2: string,
			) {}

			static staticMethodWithParameters(param1: string, param2: string): void;
			@staticMethodDecorator(1)
			@staticMethodDecorator(2)
			@staticMethodDecorator(3)
			static staticMethodWithParameters(
				@staticParameterDecorator(1)
				@staticParameterDecorator(2)
				@staticParameterDecorator(3)
				param1: string,
				@staticParameterDecorator(4)
				@staticParameterDecorator(5)
				@staticParameterDecorator(6)
				param2: string,
			) {}
		}

		const EXPECTED_EVENT_ORDER = [
			"method_Foo_method_1_initialized",
			"method_Foo_method_2_initialized",
			"method_Foo_method_3_initialized",
			"method_Foo_method_3_executed",
			"method_Foo_method_2_executed",
			"method_Foo_method_1_executed",
			"property_Foo_property_1_initialized",
			"property_Foo_property_2_initialized",
			"property_Foo_property_3_initialized",
			"property_Foo_property_3_executed",
			"property_Foo_property_2_executed",
			"property_Foo_property_1_executed",
			"method_Foo_methodWithParameters_1_initialized",
			"method_Foo_methodWithParameters_2_initialized",
			"method_Foo_methodWithParameters_3_initialized",
			"parameter_Foo_methodWithParameters_0_1_initialized",
			"parameter_Foo_methodWithParameters_0_2_initialized",
			"parameter_Foo_methodWithParameters_0_3_initialized",
			"parameter_Foo_methodWithParameters_1_4_initialized",
			"parameter_Foo_methodWithParameters_1_5_initialized",
			"parameter_Foo_methodWithParameters_1_6_initialized",
			"parameter_Foo_methodWithParameters_1_6_executed",
			"parameter_Foo_methodWithParameters_1_5_executed",
			"parameter_Foo_methodWithParameters_1_4_executed",
			"parameter_Foo_methodWithParameters_0_3_executed",
			"parameter_Foo_methodWithParameters_0_2_executed",
			"parameter_Foo_methodWithParameters_0_1_executed",
			"method_Foo_methodWithParameters_3_executed",
			"method_Foo_methodWithParameters_2_executed",
			"method_Foo_methodWithParameters_1_executed",
			"staticMethod_Foo_staticMethod_1_initialized",
			"staticMethod_Foo_staticMethod_2_initialized",
			"staticMethod_Foo_staticMethod_3_initialized",
			"staticMethod_Foo_staticMethod_3_executed",
			"staticMethod_Foo_staticMethod_2_executed",
			"staticMethod_Foo_staticMethod_1_executed",
			"staticProperty_Foo_staticProperty_1_initialized",
			"staticProperty_Foo_staticProperty_2_initialized",
			"staticProperty_Foo_staticProperty_3_initialized",
			"staticProperty_Foo_staticProperty_3_executed",
			"staticProperty_Foo_staticProperty_2_executed",
			"staticProperty_Foo_staticProperty_1_executed",
			"staticMethod_Foo_staticMethodWithParameters_1_initialized",
			"staticMethod_Foo_staticMethodWithParameters_2_initialized",
			"staticMethod_Foo_staticMethodWithParameters_3_initialized",
			"staticParameter_Foo_staticMethodWithParameters_0_1_initialized",
			"staticParameter_Foo_staticMethodWithParameters_0_2_initialized",
			"staticParameter_Foo_staticMethodWithParameters_0_3_initialized",
			"staticParameter_Foo_staticMethodWithParameters_1_4_initialized",
			"staticParameter_Foo_staticMethodWithParameters_1_5_initialized",
			"staticParameter_Foo_staticMethodWithParameters_1_6_initialized",
			"staticParameter_Foo_staticMethodWithParameters_1_6_executed",
			"staticParameter_Foo_staticMethodWithParameters_1_5_executed",
			"staticParameter_Foo_staticMethodWithParameters_1_4_executed",
			"staticParameter_Foo_staticMethodWithParameters_0_3_executed",
			"staticParameter_Foo_staticMethodWithParameters_0_2_executed",
			"staticParameter_Foo_staticMethodWithParameters_0_1_executed",
			"staticMethod_Foo_staticMethodWithParameters_3_executed",
			"staticMethod_Foo_staticMethodWithParameters_2_executed",
			"staticMethod_Foo_staticMethodWithParameters_1_executed",
			"class_Foo_1_initialized",
			"class_Foo_2_initialized",
			"class_Foo_3_initialized",
			"constructorParameter_Foo_0_1_initialized",
			"constructorParameter_Foo_0_2_initialized",
			"constructorParameter_Foo_0_3_initialized",
			"constructorParameter_Foo_1_4_initialized",
			"constructorParameter_Foo_1_5_initialized",
			"constructorParameter_Foo_1_6_initialized",
			"constructorParameter_Foo_1_6_executed",
			"constructorParameter_Foo_1_5_executed",
			"constructorParameter_Foo_1_4_executed",
			"constructorParameter_Foo_0_3_executed",
			"constructorParameter_Foo_0_2_executed",
			"constructorParameter_Foo_0_1_executed",
			"class_Foo_3_executed",
			"class_Foo_2_executed",
			"class_Foo_1_executed",
		];

		for (let i = 0; i < EXPECTED_EVENT_ORDER.size(); i++) {
			const { tag, state } = events[i];
			expect(`${tag}_${state}`).to.equal(EXPECTED_EVENT_ORDER[i]);
		}
	});
};
