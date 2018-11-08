export = () => {
	it("should allow instanceof", () => {
		class Vector {
			constructor(public readonly x = 0, public readonly y = 0, public readonly z = 0) {}
		}
		expect(new Vector(1, 2, 3) instanceof Vector).to.equal(true);
		expect({} instanceof Vector).to.equal(false);
		expect(new Vector2(20, 30) instanceof Vector2).to.equal(true);
		expect({} instanceof Vector2).to.equal(false);
		expect(new Frame() instanceof Frame).to.equal(true);
		expect({} instanceof Frame).to.equal(false);
	});
};
