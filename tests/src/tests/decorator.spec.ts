export = () => {
	it("should support parameter decorators", () => {
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

	it("should support method decorators", () => {
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

	it("should support property decorators", () => {
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
};
