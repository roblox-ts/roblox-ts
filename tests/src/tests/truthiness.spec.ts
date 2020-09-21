/// <reference types="@rbxts/testez/globals" />

export = () => {
	it("should support JS truthiness", () => {
		function isTruthy(x?: unknown) {
			const y = !!x;
			// make sure that the expression is equivalent to an if statement
			if (!!x) {
				expect(y).to.equal(true);
			} else {
				expect(y).to.equal(false);
			}
			return y;
		}
		expect(isTruthy()).to.equal(false);
		expect(isTruthy(undefined)).to.equal(false);
		expect(isTruthy("")).to.equal(false);
		expect(isTruthy("Hello")).to.equal(true);
		expect(isTruthy(0)).to.equal(false);
		expect(isTruthy(1)).to.equal(true);
		expect(isTruthy(0 / 0)).to.equal(false);
		expect(isTruthy([])).to.equal(true);
		expect(isTruthy([1])).to.equal(true);
		expect(isTruthy({})).to.equal(true);
		expect(isTruthy({ a: 0 })).to.equal(true);
	});

	it("should support truthiness in && expressions", () => {
		let i = 0;
		function f(s: string) {
			const x = s && "Go";
			const y = s === "" ? "" : "Go";
			expect(x).to.equal(y);
			expect(s && "Go").to.equal(y);

			if (s && i++) {
				expect(s).to.equal("thing");
				expect(i).to.equal(2);
			}
		}
		f("");
		f("stuff");
		f("thing");
	});

	it("should support truthiness in || expressions", () => {
		let i = 0;
		function f(s: string) {
			const x = s || "default";
			const y = s === "" ? "default" : s;
			expect(x).to.equal(y);
			expect(s || "default").to.equal(y);

			if (s || i++) {
				expect(s).to.equal("stuff");
				expect(i).to.equal(1);
			}
		}
		f("");
		f("stuff");
	});

	it("should support binary expressions", () => {
		function test(
			x: string | undefined,
			answers: [
				string | boolean | undefined,
				string | boolean | undefined,
				string | boolean | undefined,
				string | boolean | undefined,
				string | boolean | undefined,
				string | boolean | undefined,
			],
		) {
			let i = -1;
			expect(x && x === "Soup").to.equal(answers[++i]);
			expect(x || x === "Soup").to.equal(answers[++i]);
			expect(!x && x === "Soup").to.equal(answers[++i]);
			expect(!x || x === "Soup").to.equal(answers[++i]);
			expect(!!x && x === "Soup").to.equal(answers[++i]);
			expect(!!x || x === "Soup").to.equal(answers[++i]);
		}

		test(undefined, [undefined, false, false, true, false, false]);
		test("", ["", false, false, true, false, false]);
		test("a", [false, "a", false, false, false, true]);
		test("Soup", [true, "Soup", false, true, true, true]);
	});

	it("should support returning binary expressions", () => {
		function f(s: string) {
			return s || "default";
		}

		function g(s: string) {
			return s && "default";
		}

		expect(f("")).to.equal("default");
		expect(f("a")).to.equal("a");

		expect(g("")).to.equal("");
		expect(g("a")).to.equal("default");
	});
};
