export = () => {
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
};
