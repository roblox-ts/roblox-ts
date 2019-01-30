export = () => {
	it("should support numeric for loops", () => {
		let sum = 10;
		for (let i = 0; i < 10; i++) {
			sum--;
		}
		expect(sum).to.equal(0);
	});

	it("should support for-of loops", () => {
		const array = [1, 2, 3];
		let sum = 0;
		for (const value of array) {
			sum += value;
		}
		expect(sum).to.equal(6);
	});

	it("should support for-in loops", () => {
		const obj: { [index: string]: number } = {
			a: 1,
			b: 2,
			c: 3,
		};
		for (const key in obj) {
			obj[key]++;
		}
		expect(obj.a).to.equal(2);
		expect(obj.b).to.equal(3);
		expect(obj.c).to.equal(4);
	});

	it("should support break", () => {
		const array = [1, 2, 3, 4, 5];
		let sum = 0;
		for (const value of array) {
			sum += value;
			if (value === 3) {
				break;
			}
		}
		expect(sum).to.equal(6);
	});

	it("should support continue", () => {
		const array = [1, 2, 3, 4];
		let sum = 0;
		for (const value of array) {
			if (value === 3) {
				continue;
			}
			sum += value;
		}
		expect(sum).to.equal(7);
	});

	it("should support do-while loops", () => {
		let x = 0;
		do {
			x += 5;
		} while (x < 25);
		expect(x).to.equal(25);
	});

	it("should support while loops", () => {
		let x = 0;
		while (x < 10) {
			x++;
		}
		expect(x).to.equal(10);
	});

	it("should support for-of destructuring", () => {
		const arr = [
			{
				a: 1,
				b: 2,
				c: 3,
			},
		];
		for (const { a, b, c } of arr) {
			expect(a).to.equal(1);
			expect(b).to.equal(2);
			expect(c).to.equal(3);
		}
	});
	
	it("should work with gmatch", () => {
		for (const a in "H".gmatch(".")) {
			expect(a).to.equal("H");
		}
	});
};
