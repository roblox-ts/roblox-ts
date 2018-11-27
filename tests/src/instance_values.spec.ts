export = () => {
	it("should allow passing Roblox instances as values", () => {
		expect(Frame).to.be.ok();

		const frame = Frame;
		expect((new frame()).ClassName).to.equal("Frame");
	});
};
