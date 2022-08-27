export = () => {
	it("should support using the Roblox API", () => {
		expect(game.FindFirstChild("Workspace")).to.equal(game.GetService("Workspace"));
	});

	it("should support calling Roblox API methods with element expressions", () => {
		expect(game["FindFirstChild"]("Workspace")).to.equal(game["GetService"]("Workspace"));
	});
};
