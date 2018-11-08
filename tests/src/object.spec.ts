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

		const baz = {
			a: 6,
			...foo,
			...foo,
			...foo,
			e: 72,
			...bar,
		};
	});
};
