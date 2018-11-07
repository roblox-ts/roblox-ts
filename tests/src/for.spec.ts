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
};
