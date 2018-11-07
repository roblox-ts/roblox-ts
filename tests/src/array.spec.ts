export = () => {
	it("should allow length", () => {
		expect([].length).to.equal(0);
		expect([1].length).to.equal(1);
		expect([1, 2].length).to.equal(2);
		expect([1, 2, 3].length).to.equal(3);
	});

	it("should allow push", () => {
		const a = new Array<number>();
		a.push(123);
		expect(a[0]).to.equal(123);
	});

	it("should allow pop", () => {
		const a = [456];
		const b = a.pop();
		expect(b).to.equal(456);
		expect(a.length).to.equal(0);
		expect(a[0]).never.to.be.ok();
	});

	it("should allow concat", () => {
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

	it("should allow join", () => {
		const a = [1, 2, 3];
		expect(a.join(", ")).to.equal("1, 2, 3");
	});

	it("should allow reverse", () => {
		const a = [1, 2, 3];
		const b = a.reverse();
		expect(b).never.to.equal(a);
		expect(b[0]).to.equal(3);
		expect(b[1]).to.equal(2);
		expect(b[2]).to.equal(1);
	});

	it("should allow shift", () => {
		const a = [1, 2, 3];
		const b = a.shift();
		expect(b).to.equal(1);
		expect(a.length).to.equal(2);
		expect(a[0]).to.equal(2);
		expect(a[1]).to.equal(3);
	});

	it("should allow slice", () => {
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
		const e = a.slice();
	});

	// TODO issue #98
	it("should allow sort", () => {});

	it("should allow splice", () => {
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

	it("should allow unshift", () => {
		const a = [1, 2, 3];
		const b = a.unshift(4);
		expect(a[0]).to.equal(4);
		expect(a[1]).to.equal(1);
		expect(a[2]).to.equal(2);
		expect(a[3]).to.equal(3);
		expect(b).to.equal(4);
	});

	it("should allow indexOf", () => {
		const a = [7, 1, 8, 1, 9];
		expect(a.indexOf(1)).to.equal(1);
		expect(a.indexOf(2)).to.equal(-1);
	});

	it("should allow lastIndexOf", () => {
		const a = [7, 1, 8, 1, 9];
		expect(a.lastIndexOf(1)).to.equal(3);
		expect(a.lastIndexOf(2)).to.equal(-1);
	});

	it("should allow every", () => {
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

	it("should allow some", () => {
		const a = [1, 2, 3];
		expect(a.some(v => v === 2)).to.equal(true);
		expect(a.some(v => v === 4)).to.equal(false);
	});

	it("should allow forEach", () => {
		const bin = [1, 2, 3];
		let str = "";
		bin.forEach(v => (str += v));
		expect(str).to.equal("123");
	});

	it("should allow map", () => {
		const a = [1, 2, 3];
		const b = a.map(v => v + 1);
		expect(b).never.to.equal(a);
		expect(b[0]).to.equal(2);
		expect(b[1]).to.equal(3);
		expect(b[2]).to.equal(4);
	});

	it("should allow filter", () => {
		const a = [1, 2, 3, 4, 5];
		const b = a.filter(v => v % 2 === 0);
		expect(b).never.to.equal(a);
		expect(b.length).to.equal(2);
		expect(b[0]).to.equal(2);
		expect(b[1]).to.equal(4);
	});

	it("should allow reduce", () => {
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

	it("should allow reduceRight", () => {
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

	it("should allow find", () => {
		const a = [1, 2, 3, 4, 5];

		const b = a.find(v => v % 2 === 0);
		expect(b).to.equal(2);

		const c = a.find(v => v === 6);
		expect(c).never.to.be.ok();

		const d = a.find(v => v % 2 !== 0);
		expect(d).to.equal(1);
	});
};
