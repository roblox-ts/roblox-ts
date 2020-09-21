/// <reference types="@rbxts/testez/globals" />

declare const self: undefined;

namespace N {
	export let x = 5;
	export const p = { a: { x } };
}

export = () => {
	it("should support object literal brackets", () => {
		/* prettier-ignore */
		const obj = {
			test: 1,
			"2": 2,
			[1]: 3,
		};

		expect(obj.test).to.equal(1);
		expect(obj["2"]).to.equal(2);
		expect(obj[1]).to.equal(3);
	});

	it("should support numeric indexing", () => {
		const obj: { [key: number]: number } = {
			2: 1,
		};

		let i = 2;
		let a = obj[i];
		let b = obj[2];
		let { [i]: c } = obj;
		let { [2]: d } = obj;

		expect(a).to.equal(1);
		expect(b).to.equal(1);
		expect(c).to.equal(1);
		expect(d).to.equal(1);

		a = obj[i];
		b = obj[2];
		({ [i]: c } = obj);
		({ [2]: d } = obj);

		expect(a).to.equal(1);
		expect(b).to.equal(1);
		expect(c).to.equal(1);
		expect(d).to.equal(1);

		let j = 0;
		function f() {
			j++;
			return 2;
		}
		const o: { [i: number]: number } = {
			0: 2,
			1: 4,
			2: 5,
			3: 6,
			4: 5,
		};
		o[f()]++;
		const x = o[f()]++;
		expect(x).to.equal(6);
		expect(o[2]).to.equal(7);
		expect(j).to.equal(2);
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

		let i = 0;
		const qq = {
			count: 1,
			async [++i]() {},
			[++i]: () => 1,
			async [`${++i}`]() {},
			async [++i]() {},
			[++i]: () => 1,
			async [`${++i}`]() {},
			f() {},
			async g() {},
		}.f();
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

		{
			const k = { o: 1, b: 2 };
			const o = {
				...k,
				o: 3,
				b: k.o++,
			};

			expect(o.o).to.equal(3);
			expect(o.b).to.equal(1);
		}

		{
			const k = { o: 1, b: 2 };
			const o = {
				// @ts-ignore
				o: 3,
				...k,
				b: k.o++,
			};

			expect(o.o).to.equal(1);
			expect(o.b).to.equal(1);
		}

		{
			const k = { o: 1, b: 2 };
			const o = {
				// @ts-ignore
				o: 3,
				// @ts-ignore
				b: k.o++,
				...k,
			};

			expect(o.o).to.equal(2);
			expect(o.b).to.equal(2);
		}
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
			const foo = {
				a: 1,
				b: 2,
				c: 3,
			};

			const a = Object.keys(foo);
			expect(a.some(v => v === "a")).to.equal(true);
			expect(a.some(v => v === "b")).to.equal(true);
			expect(a.some(v => v === "c")).to.equal(true);

			const obj = {
				a: 1,
				b: 2,
				c: 3,
			};
			const keys = Object.keys(obj);
			expect(keys.size()).to.equal(3);
			expect(keys.some(v => v === "a")).to.equal(true);
			expect(keys.some(v => v === "b")).to.equal(true);
			expect(keys.some(v => v === "c")).to.equal(true);
		});

		it("should support Object.values()", () => {
			const foo = {
				a: 1,
				b: 2,
				c: 3,
			};

			const a = Object.values(foo);
			expect(a.some(v => v === 1)).to.equal(true);
			expect(a.some(v => v === 2)).to.equal(true);
			expect(a.some(v => v === 3)).to.equal(true);

			const obj = {
				a: 1,
				b: 2,
				c: 3,
			};
			const values = Object.values(obj);
			expect(values.size()).to.equal(3);
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
			expect({ [0]: 1 }[0]).to.equal(1);
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

	it("should support computedMethodNames", () => {
		{
			function g(n: 5) {
				expect(self).to.equal(undefined);
				return o.f(n);
			}
			let i = 0;
			const o = {
				g,
				id: ++i,
				calls: 0,

				[++i](n: 5) {
					return this.f(n);
				},

				f(n: 5) {
					return ++this.calls;
				},
			};
			const b = { k: o };
			expect(b.k[i](5)).to.equal(1);
			expect(o[i](5)).to.equal(2);
			expect(o.f(5)).to.equal(3);
			expect(o.g(5)).to.equal(4);
			expect(++o.calls).to.equal(5);
		}
	});

	it("should support invalid Lua identifier members", () => {
		let i = 0;

		const o = {
			$() {
				return ++this.$v;
			},
			$v: 1,
		};
		const k = { o };

		const fo = () => {
			++i;
			return o;
		};

		const fk = () => {
			++i;
			return k;
		};

		expect(o.$()).to.equal(2);
		expect(o.$v++).to.equal(2);
		expect(++o.$v).to.equal(4);
		const x = o.$v++;
		expect(x).to.equal(4);
		const y = ++o.$v;
		expect(y).to.equal(6);

		expect(k.o.$()).to.equal(7);
		expect(k.o.$v++).to.equal(7);
		expect(++k.o.$v).to.equal(9);
		const a = k.o.$v++;
		expect(a).to.equal(9);
		const b = ++k.o.$v;
		expect(b).to.equal(11);

		expect(fo().$()).to.equal(12);
		expect(fo().$v++).to.equal(12);
		expect(++fo().$v).to.equal(14);
		const c = fo().$v++;
		expect(c).to.equal(14);
		const d = ++fo().$v;
		expect(d).to.equal(16);
		expect(i).to.equal(5);

		expect(fk().o.$()).to.equal(17);
		expect(fk().o.$v++).to.equal(17);
		expect(++fk().o.$v).to.equal(19);
		const e = fk().o.$v++;
		expect(e).to.equal(19);
		const f = ++fk().o.$v;
		expect(f).to.equal(21);
		expect(i).to.equal(10);
	});

	it("should support shorthand assignments", () => {
		expect(++N.p.a.x).to.equal(6);
	});

	it("should support computed members", () => {
		let a = 8;
		let i = 0;
		const b = { [a]: `${++i}${(a = 9)}` };
		const c = { [a]: 1 };
		expect(b[8]).to.equal(`19`);
		expect(c[9]).to.equal(1);
	});

	it("should support composing objects with methods and callbacks", () => {
		interface Numerable {
			n: number;
		}

		function add(this: Numerable, n: number) {
			return (this.n += n);
		}

		const mul = function<T extends Numerable>(this: T, n: number) {
			this.n *= n;
			return this;
		};

		function h(n: number) {
			expect(n).to.equal(5);
		}

		const obj = { add, n: 10, mul, h };
		expect(obj.add(5)).to.equal(15);
		expect(obj.mul(3).add(6)).to.equal(51);
		obj.h(5);
	});

	it("should support object member functions as implicitly being methods", () => {
		// don't ask me why, but for some reason non-method function members in objects are implicitly methods

		const o = {
			count: 1,

			getCount: function() {
				return this.count;
			},
		};

		expect(o.getCount()).to.equal(1);
	});
};
