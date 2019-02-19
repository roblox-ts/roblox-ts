export = () => {
	it("should destructure simple arrays", () => {
		const [a, b] = [1, 2];
		expect(a).to.equal(1);
		expect(b).to.equal(2);
	});

	it("should destructure nested arrays", () => {
		const [[a, b], [c, d]] = [[7, 2], [8, 9]];
		expect(a).to.equal(7);
		expect(b).to.equal(2);
		expect(c).to.equal(8);
		expect(d).to.equal(9);
	});

	it("should destructure simple objects", () => {
		const a = {
			b: 1,
			c: 2,
			d: 3,
		};
		const { b, c, d } = a;
		expect(b).to.equal(1);
		expect(c).to.equal(2);
		expect(d).to.equal(3);
	});

	it("should destructure nested objects", () => {
		const a = {
			b: {
				c: {
					d: 123,
				},
			},
		};
		const {
			b: {
				c: { d },
			},
		} = a;
		expect(d).to.equal(123);
	});

	it("should destructure mixed objects", () => {
		const a = {
			b: {
				c: [8, 1, 4],
			},
		};

		const {
			b: {
				c: [eight, one, four],
			},
		} = a;

		expect(eight).to.equal(8);
		expect(one).to.equal(1);
		expect(four).to.equal(4);
	});

	it("should support default values", () => {
		const foo = {
			a: {
				b: 1,
			},
		};

		const bar = {
			a: {
				b: undefined,
			},
		};

		{
			const {
				a: { b = 5 },
			} = foo;
			expect(b).to.equal(1);
		}
		{
			const {
				a: { b = 5 },
			} = bar;
			expect(b).to.equal(5);
		}
	});

	it("should support aliases", () => {
		const foo = {
			a: {
				b: 123,
			},
		};

		const {
			a: { b: z },
		} = foo;
		expect(z).to.equal(123);
	});

	it("should not optimize array destructuring", () => {
		function a() {
			return [1, 2, 3];
		}
		const [d, e, f] = a();
		expect(d).to.equal(1);
		expect(e).to.equal(2);
		expect(f).to.equal(3);
	});

	it("should optimize tuple destructuring", () => {
		function a(): [number, number, number] {
			return [1, 2, 3];
		}
		const [d, e, f] = a();
		expect(d).to.equal(1);
		expect(e).to.equal(2);
		expect(f).to.equal(3);
	});

	it("should optimize tuple destructuring with omitted expressions", () => {
		function a(): [number, number, number, number] {
			return [1, 2, 3, 4];
		}
		const [, b, , c] = a();
		expect(b).to.equal(2);
		expect(c).to.equal(4);
	});

	it("should localize varargs if they are destructured in nested functions", () => {
		function b(arg1?: number, arg2?: number): [number, number] {
			return [arg1 || 1, arg2 || 1];
		}
		function a(...args: number[]): [number, number] {
			const x = () => {
				return b(...args);
			};
			return x();
		}
		const [c, d] = a(1, 2);
		expect(c).to.equal(1);
		expect(d).to.equal(2);
	});

	it("should support destructure assignment", () => {
		let x: number;
		let y: number;
		let z: number;
		[x, y, [z]] = [1, 2, [3]];
		expect(x).to.equal(1);
		expect(y).to.equal(2);
		expect(z).to.equal(3);
	});

	it("should support destructure assignment with identifier", () => {
		let x: number;
		let y: number;
		let z: number;
		const obj: [number, number, [number]] = [1, 2, [3]];
		[x, y, [z]] = obj;
		expect(x).to.equal(1);
		expect(y).to.equal(2);
		expect(z).to.equal(3);
	});

	it("should support destructure assignment as expression", () => {
		function test(obj: [number, number, [number]]) {
			expect(obj[0]).to.equal(1);
			expect(obj[1]).to.equal(2);
			expect(obj[2][0]).to.equal(3);
		}

		let x: number;
		let y: number;
		let z: number;
		test(([x, y, [z]] = [1, 2, [3]]));
		expect(x).to.equal(1);
		expect(y).to.equal(2);
		expect(z).to.equal(3);
	});

	it("should support destructure assignment with property access", () => {
		const obj = {
			x: 0,
			y: 0,
			z: 0,
		};
		[obj.x, obj.y, [obj.z]] = [1, 2, [3]];
		expect(obj.x).to.equal(1);
		expect(obj.y).to.equal(2);
		expect(obj.z).to.equal(3);
	});

	it("should support indexing a return value from a function", () => {
		function foo(): [number, number, number] {
			return [1, 2, 3];
		}
		function bar() {
			return [4, 5, 6];
		}
		expect(foo()[0]).to.equal(1);
		expect(foo()[1]).to.equal(2);
		expect(foo()[2]).to.equal(3);
		expect(bar()[0]).to.equal(4);
		expect(bar()[1]).to.equal(5);
		expect(bar()[2]).to.equal(6);
	});
};
