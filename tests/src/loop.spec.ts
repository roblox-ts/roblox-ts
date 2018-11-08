export = () => {
	it("should allow numeric for loops", () => {
		let sum = 10;
		for (let i = 0; i < 10; i++) {
			sum--;
		}
		expect(sum).to.equal(0);
	});

	it("should allow for-of loops", () => {
		const array = [1, 2, 3];
		let sum = 0;
		for (const value of array) {
			sum += value;
		}
		expect(sum).to.equal(6);
	});

	it("should allow for-in loops", () => {
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

	it("should allow break", () => {
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

	it("should allow continue", () => {
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

	it("should allow do-while loops", () => {
		let x = 0;
		do {
			x += 5;
		} while (x < 25);
		expect(x).to.equal(25);
	});

	it("should allow while loops", () => {
		let x = 0;
		while (x < 10) {
			x++;
		}
		expect(x).to.equal(10);
	});
};
