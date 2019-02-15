export = () => {
	it("should support bitwise operations", () => {
		const a = 0b101;
		const b = 0b110;
		expect(a | b).to.equal(0b111);
		expect(a & b).to.equal(0b100);
		expect(a ^ b).to.equal(0b011);
		expect(a << 1).to.equal(0b1010);
		expect(a >> 1).to.equal(0b10);
	});
};
