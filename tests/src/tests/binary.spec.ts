/// <reference types="@rbxts/testez/globals" />

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

		i = 0;
		expect(({ [++i]: ++i }[i++ - 1] *= ++i)).to.equal(8);

		{
			{
				{
					let i = 0;
					expect(
						{
							jk: {
								o: 3,
								b: i++,
								a4: { 2: i, k: 4 },

								g() {
									this.b++;
								},

								no: function() {
									return (this[5] *= 7);
								},

								5: 3,
							},
						}.jk.no(),
					).to.equal(21);

					expect(
						{
							o: 8,
							a() {
								++this.o;
								return this;
							},

							e() {
								return ++this.o;
							},
						}
							.a()
							.e(),
					).to.equal(10);
				}
			}
		}
	});

	it("should push WritableOperandNames", () => {
		let numItems = 0;
		new (class {
			public id = numItems++;
		})().id++;
		expect(numItems).to.equal(1);
	});

	it("should support unary expressions on indexed parenthesized expressions", () => {
		// issue #470
		const array = [0];
		// prettier-ignore
		(array)[0]++;
		expect(array[0]).to.equal(1);
	});

	it("should support unary expressions on indexed call expressions", () => {
		const array = [0];
		function getArray() {
			return array;
		}
		getArray()[0]++;
		expect(array[0]).to.equal(1);
	});

	it("should always put parentheses around unary expressions", () => {
		const buttonSize = 10;
		const a = -(48 + 1 * (buttonSize + 4) + 4);
		const b = -48 + 1 * (buttonSize + 4) + 4;
		expect(a).to.equal(-66);
		expect(b).to.equal(-30);
	});

	it("should support set expressions with parenthesis around the left-hand side", () => {
		let x = 5;
		// prettier-ignore
		(x) *= 9;
		expect(x).to.equal(45);

		let o = { x: 3 };
		// prettier-ignore
		(o.x) = 5;
		expect(o.x).to.equal(5);
		// prettier-ignore
		(o["x"]) = 8;
		expect(o.x).to.equal(8);
	});
};
