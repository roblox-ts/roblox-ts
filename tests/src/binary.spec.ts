export = () => {
	it("should support binary expressions on properties", () => {
		const foo = {
			bar: 1,
		};
		foo.bar++;
		expect(foo.bar).to.equal(2);
	});

	it("should support binary assignment on properties", () => {
		const foo = {
			bar: 1,
		};
		foo.bar += 1;
		expect(foo.bar).to.equal(2);
	});

	it("should support computedPropertyAccessExpressions requiring precedingStatements", () => {
		let x = 0;

		const arr = [3, 4, 5];

		function f() {
			return ++x;
		}

		expect((arr[f()] *= ++x)).to.equal(8);
		expect(x).to.equal(2);

		let numCalls = 0;
		function g(): { [k: number]: number } {
			return { [2]: ++numCalls };
		}

		let i = 2;
		expect((g()[i++] *= i)).to.equal(3);
		expect(numCalls).to.equal(1);
	});

	it("should push WritableOperandNames", () => {
		let numItems = 0;
		new (class {
			public id = numItems++;
		})().id++;
		expect(numItems).to.equal(1);
	});
};
