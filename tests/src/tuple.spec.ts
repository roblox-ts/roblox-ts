export = () => {
	it("should unpack function return tuples", () => {
		function foo(): [number, number] {
			return [101, 203];
		}
		const [a, b] = foo();
		expect(a).to.equal(101);
		expect(b).to.equal(203);

		const c = foo();
		expect(c[0]).to.equal(101);
		expect(c[1]).to.equal(203);

		expect(foo()[0]).to.equal(101);
		expect(foo()[1]).to.equal(203);
	});

	it("should support wrapping function results", () => {
		function foo() {
			return [1, 2, 3];
		}
		expect(foo()[0]).to.equal(1);
		expect(foo()[1]).to.equal(2);
		expect(foo()[2]).to.equal(3);
	});

	it("should support functions returning tuple calls", () => {
		function foo(): [number, string] {
			return [1, "2"];
		}

		function bar() {
			return foo();
		}

		const [a, b] = bar();
		expect(a).to.equal(1);
		expect(b).to.equal("2");
	});

	it("should support wrapping tuple returns in tuple", () => {
		function foo(): [number, string] {
			return [1, "2"];
		}

		function bar(): [[number, string], boolean] {
			return [foo(), true];
		}

		const [[a, b], c] = bar();
		expect(a).to.equal(1);
		expect(b).to.equal("2");
		expect(c).to.equal(true);
	});

	it("should support function calls with tuple returns as expression statements", () => {
		let itWorked = false;
		function foo(): [number, string] {
			itWorked = true;
			return [1, "2"];
		}
		foo();
		expect(itWorked).to.equal(true);
	});

	it("should support indirect tuple returns", () => {
		function foo(): [number, number, number] {
			const result: [number, number, number] = [1, 2, 3];
			return result;
		}
		const [x, y, z] = foo();
		expect(x).to.equal(1);
		expect(y).to.equal(2);
		expect(z).to.equal(3);
	});
};
