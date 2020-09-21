/// <reference types="@rbxts/testez/globals" />

export = () => {
	it("should permit the use of GetEnums()", () => {
		for (const enumType of Enum.GetEnums()) {
			for (const { Name: name } of enumType.GetEnumItems()) {
				expect(typeOf(name)).to.equal("string");
			}
		}
	});
	it("should permit the use of GetEnumItems()", () => {
		const axisNames = new Set(["X", "Y", "Z"]);
		for (const { Name: name } of Enum.Axis.GetEnumItems()) {
			expect(axisNames.has(name)).to.equal(true);
		}
	});
};
