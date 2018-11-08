export = () => {
	it("should support element access", () => {
		const a = [1, 2, 3];
		expect(a[0]).to.equal(1);
		expect(a[1]).to.equal(2);
		expect(a[2]).to.equal(3);
		expect([1, 2, 3][0]).to.equal(1);
		expect([1, 2, 3][1]).to.equal(2);
		expect([1, 2, 3][2]).to.equal(3);

		function foo() {
			const result = [1, 2, 3];
			return result;
		}
		expect(foo()[0]).to.equal(1);
		expect(foo()[1]).to.equal(2);
		expect(foo()[2]).to.equal(3);
	});

	it("should support length", () => {
		expect([].length).to.equal(0);
		expect([1].length).to.equal(1);
		expect([1, 2].length).to.equal(2);
		expect([1, 2, 3].length).to.equal(3);
	});

	it("should support push", () => {
		const a = new Array<number>();
		a.push(123);
		expect(a[0]).to.equal(123);
	});

	it("should support pop", () => {
		const a = [456];
		const b = a.pop();
		expect(b).to.equal(456);
		expect(a.length).to.equal(0);
		expect(a[0]).never.to.be.ok();
	});

	it("should support concat", () => {
		const a = [1, 2, 3];
		const b = [4, 5, 6];
		const c = a.concat(b);
		expect(c).never.to.equal(a);
		expect(c).never.to.equal(b);
		expect(c[0]).to.equal(1);
		expect(c[1]).to.equal(2);
		expect(c[2]).to.equal(3);
		expect(c[3]).to.equal(4);
		expect(c[4]).to.equal(5);
		expect(c[5]).to.equal(6);
	});

	it("should support join", () => {
		const a = [1, 2, 3];
		expect(a.join(", ")).to.equal("1, 2, 3");
	});

	it("should support reverse", () => {
		const a = [1, 2, 3];
		const b = a.reverse();
		expect(b).never.to.equal(a);
		expect(b[0]).to.equal(3);
		expect(b[1]).to.equal(2);
		expect(b[2]).to.equal(1);
	});

	it("should support shift", () => {
		const a = [1, 2, 3];
		const b = a.shift();
		expect(b).to.equal(1);
		expect(a.length).to.equal(2);
		expect(a[0]).to.equal(2);
		expect(a[1]).to.equal(3);
	});

	it("should support slice", () => {
		const a = [1, 2, 3];

		const b = a.slice();
		expect(b).never.to.equal(a);
		expect(b.length).to.equal(3);
		expect(b[0]).to.equal(1);
		expect(b[1]).to.equal(2);
		expect(b[2]).to.equal(3);

		const c = a.slice(0, 1);
		expect(c).never.to.equal(a);
		expect(c.length).to.equal(1);
		expect(c[0]).to.equal(1);

		const d = a.slice(-2);
		expect(d).never.to.equal(a);
		expect(d.length).to.equal(2);
		expect(d[0]).to.equal(2);
		expect(d[1]).to.equal(3);

		const e = a.slice();
		expect(e).never.to.equal(a);
		expect(e.length).to.equal(3);
		expect(e[0]).to.equal(1);
		expect(e[1]).to.equal(2);
		expect(e[2]).to.equal(3);
	});

	// TODO issue #98
	it("should support sort", () => {});

	it("should support splice", () => {
		function equal<T>(a: Array<T>, b: Array<T>) {
			if (a.length !== b.length) {
				return false;
			}
			for (let i = 0; i < a.length; i++) {
				if (a[i] !== b[i]) {
					return false;
				}
			}
			return true;
		}

		const months = ["Jan", "March", "April", "June"];

		months.splice(1, 0, "Feb");
		expect(equal(months, ["Jan", "Feb", "March", "April", "June"])).to.be.ok();

		months.splice(4, 1, "May");
		expect(equal(months, ["Jan", "Feb", "March", "April", "May"])).to.be.ok();
	});

	it("should support unshift", () => {
		const a = [1, 2, 3];
		const b = a.unshift(4);
		expect(a[0]).to.equal(4);
		expect(a[1]).to.equal(1);
		expect(a[2]).to.equal(2);
		expect(a[3]).to.equal(3);
		expect(b).to.equal(4);
	});

	it("should support indexOf", () => {
		const a = [7, 1, 8, 1, 9];
		expect(a.indexOf(1)).to.equal(1);
		expect(a.indexOf(2)).to.equal(-1);
	});

	it("should support lastIndexOf", () => {
		const a = [7, 1, 8, 1, 9];
		expect(a.lastIndexOf(1)).to.equal(3);
		expect(a.lastIndexOf(2)).to.equal(-1);
	});

	it("should support every", () => {
		function even(value: number) {
			return value % 2 === 0;
		}

		function odd(value: number) {
			return !even(value);
		}

		const a = [1, 2, 3, 4, 5, 6];
		expect(a.every(even)).to.equal(false);
		expect(a.every(odd)).to.equal(false);

		const b = [1, 3, 5];
		expect(b.every(even)).to.equal(false);
		expect(b.every(odd)).to.equal(true);

		const c = [2, 4, 6];
		expect(c.every(even)).to.equal(true);
		expect(c.every(odd)).to.equal(false);
	});

	it("should support some", () => {
		const a = [1, 2, 3];
		expect(a.some(v => v === 2)).to.equal(true);
		expect(a.some(v => v === 4)).to.equal(false);
	});

	it("should support forEach", () => {
		const bin = [1, 2, 3];
		let str = "";
		bin.forEach(v => (str += v));
		expect(str).to.equal("123");
	});

	it("should support map", () => {
		const a = [1, 2, 3];
		const b = a.map(v => v + 1);
		expect(b).never.to.equal(a);
		expect(b[0]).to.equal(2);
		expect(b[1]).to.equal(3);
		expect(b[2]).to.equal(4);
	});

	it("should support filter", () => {
		const a = [1, 2, 3, 4, 5];
		const b = a.filter(v => v % 2 === 0);
		expect(b).never.to.equal(a);
		expect(b.length).to.equal(2);
		expect(b[0]).to.equal(2);
		expect(b[1]).to.equal(4);
	});

	it("should support reduce", () => {
		function reducer(accum: Array<number>, value: Array<number>) {
			return accum.concat(value);
		}
		const a = [[0, 1], [2, 3], [4, 5]].reduce(reducer);
		expect(a[0]).to.equal(0);
		expect(a[1]).to.equal(1);
		expect(a[2]).to.equal(2);
		expect(a[3]).to.equal(3);
		expect(a[4]).to.equal(4);
		expect(a[5]).to.equal(5);
	});

	it("should support reduceRight", () => {
		function reducer(accum: Array<number>, value: Array<number>) {
			return accum.concat(value);
		}
		const a = [[0, 1], [2, 3], [4, 5]].reduceRight(reducer);
		expect(a[0]).to.equal(4);
		expect(a[1]).to.equal(5);
		expect(a[2]).to.equal(2);
		expect(a[3]).to.equal(3);
		expect(a[4]).to.equal(0);
		expect(a[5]).to.equal(1);
	});

	it("should support find", () => {
		const a = [1, 2, 3, 4, 5];

		const b = a.find(v => v % 2 === 0);
		expect(b).to.equal(2);

		const c = a.find(v => v === 6);
		expect(c).never.to.be.ok();

		const d = a.find(v => v % 2 !== 0);
		expect(d).to.equal(1);
	});

	it("should support spread", () => {
		const a = [1, 2, 3];
		const b = [...a, 4, 5, 6];
		expect(b[0]).to.equal(1);
		expect(b[1]).to.equal(2);
		expect(b[2]).to.equal(3);
		expect(b[3]).to.equal(4);
		expect(b[4]).to.equal(5);
		expect(b[5]).to.equal(6);
		expect(b.length).to.equal(6);

		const c = [...[1], ...[2]];
		expect(c[0]).to.equal(1);
		expect(c[1]).to.equal(2);
	});

	it("should copy on spread", () => {
		const a = [1, 2, 3];
		const b = [...a];
		expect(a).never.to.equal(b);
		expect(a.length).to.equal(b.length);
		for (let i = 0; i < a.length; i++) {
			expect(b[i]).to.equal(a[i]);
		}
	});

	it("should unpack spread into function calls", () => {
		function foo(...args: Array<number>) {
			expect(args[0]).to.equal(1);
			expect(args[1]).to.equal(2);
			expect(args[2]).to.equal(3);
		}
		foo(...[1, 2, 3]);
	});
};
