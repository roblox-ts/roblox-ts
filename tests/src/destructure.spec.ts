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
};
