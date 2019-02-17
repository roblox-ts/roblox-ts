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
	Dumpling = "DUMPLING",
}

const enum Animal {
	Bear = "BEAR",
	Dog = "DOG",
	Snake = "SNAKE",
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
		expect(Soups.Tomato).to.equal("TOMATO");
		expect(Soups.ChickenNoodle).to.equal("CHICKENNOODLE");
		expect(Soups.Dumpling).to.equal("DUMPLING");
	});

	it("should support const enums", () => {
		expect(Animal.Bear).to.equal("BEAR");
		expect(Animal.Dog).to.equal("DOG");
		expect(Animal.Snake).to.equal("SNAKE");
	});
};
