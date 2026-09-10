export = () => {
	it("should support using the Roblox API", () => {
		expect(game.FindFirstChild("Workspace")).to.equal(game.GetService("Workspace"));
		expect(classIs(game.GetService("Workspace"), "Workspace")).to.equal(true);
		expect(classIs(new Instance("Part"), "Folder")).to.equal(false);
	});

	it("should support calling Roblox API methods with element expressions", () => {
		expect(game["FindFirstChild"]("Workspace")).to.equal(game["GetService"]("Workspace"));
	});
};
