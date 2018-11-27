export = () => {
	it("should allow passing Roblox instances as values", () => {
		expect(Part).to.be.ok();

		const part = Part;
		expect((new part()).ClassName).to.equal("Part");
	});
};
