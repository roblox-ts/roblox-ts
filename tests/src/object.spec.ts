export = () => {
	it("should support object literal brackets", () => {
		/* prettier-ignore */
		/* tslint:disable */
		const obj = {
			test: 1,
			"2": 2,
			[1]: 3,
		};
		/* tslint:enable */

		expect(obj.test).to.equal(1);
		expect(obj["2"]).to.equal(2);
		expect(obj[1]).to.equal(3);
	});

	it("should support bracket index definitions", () => {
		const a = { [1]: "foo", [2]: "bar" };
		// prettier-ignore
		const b = { [ 1 ]: "baz", [ 2 ]: "boo" };
		expect(a[1]).to.equal("foo");
		expect(a[2]).to.equal("bar");
		expect(b[1]).to.equal("baz");
		expect(b[2]).to.equal("boo");
	});

	it("should support object methods", () => {
		const foo = {
			baz: "baz",
			bar() {
				return "baz";
			},
		};
		expect(foo.bar()).to.equal(foo.baz);
	});

	it("should support object spread", () => {
		const foo = {
			a: 1,
			b: 2,
			c: 3,
		};

		const bar = {
			...foo,
			d: 4,
			e: 5,
			f: 6,
		};

		expect(bar.a).to.equal(1);
		expect(bar.b).to.equal(2);
		expect(bar.c).to.equal(3);
		expect(bar.d).to.equal(4);
		expect(bar.e).to.equal(5);
		expect(bar.f).to.equal(6);
	});

	it("should overwrite with object spread", () => {
		const foo = {
			a: 1,
			b: 2,
			c: 3,
		};

		const bar = {
			a: 2,
			b: 5,
			d: 2,
		};

		const obj0 = {
			...foo,
			...bar,
		};

		expect(obj0).never.to.equal(foo);
		expect(obj0).never.to.equal(bar);

		expect(obj0.a).to.equal(2);
		expect(obj0.b).to.equal(5);
		expect(obj0.c).to.equal(3);
		expect(obj0.d).to.equal(2);

		const obj1 = {
			...bar,
			...foo,
		};

		expect(obj1).never.to.equal(foo);
		expect(obj1).never.to.equal(bar);

		expect(obj1.a).to.equal(1);
		expect(obj1.b).to.equal(2);
		expect(obj1.c).to.equal(3);
		expect(obj1.d).to.equal(2);
	});

	it("should support Object.entries", () => {
		const foo = {
			a: 1,
			b: 2,
			c: 3,
		};

		const a = Object.entries(foo);
		expect(a.some(v => v[0] === "a" && v[1] === 1)).to.equal(true);
		expect(a.some(v => v[0] === "b" && v[1] === 2)).to.equal(true);
		expect(a.some(v => v[0] === "c" && v[1] === 3)).to.equal(true);
	});

	it("should support Object.keys", () => {
		const foo = {
			a: 1,
			b: 2,
			c: 3,
		};

		const a = Object.keys(foo);
		expect(a.some(v => v === "a")).to.equal(true);
		expect(a.some(v => v === "b")).to.equal(true);
		expect(a.some(v => v === "c")).to.equal(true);
	});

	it("should support Object.values", () => {
		const foo = {
			a: 1,
			b: 2,
			c: 3,
		};

		const a = Object.values(foo);
		expect(a.some(v => v === 1)).to.equal(true);
		expect(a.some(v => v === 2)).to.equal(true);
		expect(a.some(v => v === 3)).to.equal(true);
	});

	describe("it should support Object methods", () => {
		it("should support Object.entries()", () => {
			const obj = {
				a: 1,
				b: 2,
				c: 3,
			};
			let hitA = 0;
			let hitB = 0;
			let hitC = 0;
			const entries = Object.entries(obj);
			for (const [i, v] of entries) {
				if (i === "a" && v === 1) {
					hitA++;
				} else if (i === "b" && v === 2) {
					hitB++;
				} else if (i === "c" && v === 3) {
					hitC++;
				}
			}
			expect(hitA).to.equal(1);
			expect(hitB).to.equal(1);
			expect(hitC).to.equal(1);
		});

		it("should support Object.keys()", () => {
			const obj = {
				a: 1,
				b: 2,
				c: 3,
			};
			const keys = Object.keys(obj);
			expect(keys.length).to.equal(3);
			expect(keys.some(v => v === "a")).to.equal(true);
			expect(keys.some(v => v === "b")).to.equal(true);
			expect(keys.some(v => v === "c")).to.equal(true);
		});

		it("should support Object.values()", () => {
			const obj = {
				a: 1,
				b: 2,
				c: 3,
			};
			const values = Object.values(obj);
			expect(values.length).to.equal(3);
			expect(values.some(v => v === 1)).to.equal(true);
			expect(values.some(v => v === 2)).to.equal(true);
			expect(values.some(v => v === 3)).to.equal(true);
		});

		it("should support Object.assign()", () => {
			const object1 = {
				a: 1,
				b: 2,
				c: 3,
			};
			const object2 = Object.assign({ c: 4, d: 5 }, object1);
			expect(object2.a).to.equal(1);
			expect(object2.b).to.equal(2);
			expect(object2.c).to.equal(3);
			expect(object2.d).to.equal(5);
		});

		it("should support numeric literals", () => {
			const object1 = {
				[1]: 1,
				2: 1,
			};
			expect(object1[1]).to.equal(1);
			expect(object1[2]).to.equal(1);
		});

		it("should support isEmpty", () => {
			expect(Object.isEmpty({})).to.equal(true);
			expect(
				Object.isEmpty({
					1: 2,
				}),
			).to.equal(false);
		});
	});
};
