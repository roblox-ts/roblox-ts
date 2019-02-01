// Basic enum test
enum Fruits {
	Apple,
	Orange,
	Pear,
}

// Numeric enum test
enum Breads {
	White = 5,
	Wheat,
	Pumpernickel,
}

// String enums
enum Soups {
	Tomato = "TOMATO",
	ChickenNoodle = "CHICKENNOODLE",
	Dumpling = "DUMPLINGG",
}

export = () => {
	it("should expose enums by number", () => {
		expect(Fruits[0]).to.equal("Apple");
		expect(Fruits.Orange).to.equal(1);
		expect(Fruits[2]).to.equal("Pear");
	});

	it("should support overriding indices", () => {
		expect(Breads[5]).to.equal("White");
		expect(Breads.Wheat).to.equal(6);
		expect(Breads[0]).never.to.be.ok();
	});

	it("should support for string indices", () => {
		expect(Soups.ChickenNoodle).to.equal("CHICKENNOODLE");
	});
};
