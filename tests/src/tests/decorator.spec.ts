export = () => {
	it("should support static parameter decorators", () => {
		let buzz: string | undefined;

		function foobar(object: Foo, methodKey: string, paramNum: number) {
			buzz = `${object}${methodKey}${paramNum}`;
		};

		class Foo {
			static bar(
				@foobar
				baz: string
			) { };
		};

		expect(buzz).to.equal("Foobar0");
	});
	it("should support non-static parameter decorators", () => {
		let buzz: string | undefined;

		function foobar(object: Foo, methodKey: string, paramNum: number) {
			buzz = `${object}${methodKey}${paramNum}`;
		};

		class Foo {
			public bar(
				@foobar
				baz: string
			) { };
		};

		expect(buzz).to.equal("Foobar0");
	});

	it("should support class decorators", () => {
		let buzz: Foo | undefined;

		function foobar(object: Foo) {
			buzz = object;
		};

		@foobar
		class Foo { };

		expect(buzz).to.equal(Foo);
	});

	it("should support static method decorators", () => {
		let buzz: string | undefined;

		function foobar(object: Foo, methodKey: string) {
			buzz = `${object}${methodKey}`;
		};

		class Foo {
			@foobar
			static bar() { };
		};

		expect(buzz).to.equal("Foobar");
	});

	it("should support non-static method decorators", () => {
		let buzz: string | undefined;

		function foobar(object: Foo, methodKey: string) {
			buzz = `${tostring(object)}${methodKey}`;
		};

		class Foo {
			@foobar
			public bar() { };
		};

		expect(buzz).to.equal("Foobar");
	});

	it("should support computed method decorators", () => {
		const barName = "bar"
		let buzz: string | undefined;

		function foobar(object: Foo, methodKey: string) {
			buzz = `${tostring(object)}${methodKey}`;
		};

		class Foo {
			@foobar
			public [barName]() { };
		};

		expect(buzz).to.equal("Foobar");
	});

	it("should support static property decorators", () => {
		let buzz: string | undefined;

		function foobar(object: Foo, propertyKey: string) {
			buzz = `${object}${propertyKey}`;
		};

		class Foo {
			@foobar
			static bar = "baz";
		};

		expect(buzz).to.equal(`Foobar`);
	});

	it("should support non-static property decorators", () => {
		let buzz: string | undefined;

		function foobar(object: Foo, propertyKey: string) {
			buzz = `${tostring(object)}${propertyKey}`;
		};

		class Foo {
			@foobar
			public bar = "baz";
		};

		expect(buzz).to.equal(`Foobar`);
	});

	it("should support computed property decorators", () => {
		const barName = "bar"
		let buzz: string | undefined;

		function foobar(object: Foo, propertyKey: string) {
			buzz = `${tostring(object)}${propertyKey}`;
		};

		class Foo {
			@foobar
			public [barName] = "baz";
		};

		expect(buzz).to.equal(`Foobar`);
	});

	it("should support constructor parameter decorators", () => {
		let buzz: string | undefined;

		function foobar(object: Foo, _: unknown, paramNum: number) {
			buzz = `${tostring(object)}${paramNum}`;
		};

		class Foo {
			public constructor(
				@foobar
				bar = "baz"
			) { }
		};

		expect(buzz).to.equal(`Foo0`);
	});

	it("should support complex property decorators", () => {
		enum baz {
			buzz = "bizz"
		};
		let bizz: string | undefined;

		function foobar(object: Foo, propertyKey: string) {
			bizz = `${tostring(object)}${propertyKey}`;
		};

		class Foo {
			@foobar
			public [baz.buzz] = "Hello, world!";
		};

		expect(bizz).to.equal("Foobizz");
	});
};
