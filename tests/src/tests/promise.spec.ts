export = () => {
	it("should allow async function declarations", () => {
		async function foo() {
			return "foo";
		}

		async function bar() {
			return (await foo()) + "bar";
		}

		const [success, value] = bar().await();
		expect(success).to.equal(true);
		expect(value).to.equal("foobar");
	});

	it("should allow async function expressions", () => {
		const foo = async function () {
			return "foo";
		};

		const bar = async function () {
			return (await foo()) + "bar";
		};

		const [success, value] = bar().await();
		expect(success).to.equal(true);
		expect(value).to.equal("foobar");
	});

	it("should allow async arrow function expressions", () => {
		const foo = async () => "foo";
		const bar = async () => (await foo()) + "bar";
		const [success, value] = bar().await();
		expect(success).to.equal(true);
		expect(value).to.equal("foobar");
	});

	it("should allow async static class methods", () => {
		class X {
			static async foo() {
				return "foo";
			}

			static async bar() {
				return (await this.foo()) + "bar";
			}
		}
		const [success, value] = X.bar().await();
		expect(success).to.equal(true);
		expect(value).to.equal("foobar");
	});

	it("should allow async class methods", () => {
		class X {
			async foo() {
				return "foo";
			}

			async bar() {
				return (await this.foo()) + "bar";
			}
		}
		const [success, value] = new X().bar().await();
		expect(success).to.equal(true);
		expect(value).to.equal("foobar");
	});
};
