export = () => {
	it("should support instanceof", () => {
		class Vector {
			constructor(public readonly x = 0, public readonly y = 0, public readonly z = 0) {}
		}
		expect(new Vector(1, 2, 3) instanceof Vector).to.equal(true);
		expect({} instanceof Vector).to.equal(false);
	});
};
