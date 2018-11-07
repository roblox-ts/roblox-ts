function sum(x: number, y: number) {
	return x + y;
}

function divide(x: number, y: number) {
	return x / y;
}

export = () => {
	it("should add two numbers", () => {
		expect(sum(1, 5)).to.equal(6);
		expect(sum(22, 44)).to.equal(66);
	});

	it("should divide two numbers", () => {
		expect(divide(6, 3)).to.equal(2);
		expect(divide(22, 44)).to.equal(0.5);
	});
};
