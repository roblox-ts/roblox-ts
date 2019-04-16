export = () => {
	it("should support string methods", () => {
		expect("Hello, world".sub(1, 1)).to.equal("H");
	});

	it("should support string methods on identifiers", () => {
		const str = "Hello, world";
		expect(str.sub(1, 1)).to.equal("H");
	});

	it("should support string.split", () => {
		function checkLen<T>(len: number, arr: Array<T>) {
			expect(arr.length).to.equal(len);
			return arr;
		}

		const str = "Hello, world";
		const chars = [str.byte(1, -1)].map(i => string.char(i));
		const words = ["Hello", "world"];
		const hSplit = ["", "ello, world"];

		expect(str.split("").every((char, i) => char === chars[i])).to.equal(true);
		expect(str.split(", ").every((word, i) => word === words[i])).to.equal(true);
		expect(str.split("H").every((word, i) => word === hSplit[i])).to.equal(true);
		expect(checkLen(1, "".split("a"))[0]).to.equal("");

		for (let i = 2; i < 10; i++) {
			const str = "d".rep(i - 1);
			const str1 = str.split("d");
			const str2 = str.split("d", true);
			expect(str1.length).to.equal(i);
			expect(str2.length).to.equal(i);
			expect(str1.every(c => c === "")).to.equal(true);
			expect(str2.every(c => c === "")).to.equal(true);
		}

		expect("".split("").isEmpty()).to.equal(true);
		expect("".split("", true).isEmpty()).to.equal(true);

		const slasher = ["", "Validark", "Osyris", "Vorlias", ""];
		expect(checkLen(5, "/Validark/Osyris/Vorlias/".split("/")).every((word, i) => word === slasher[i])).to.equal(
			true,
		);
		expect(checkLen(4, "Validark/Osyris/Vorlias/".split("/")).every((word, i) => word === slasher[i + 1])).to.equal(
			true,
		);
		expect(checkLen(3, "Validark/Osyris/Vorlias".split("/")).every((word, i) => word === slasher[i + 1])).to.equal(
			true,
		);
	});
};
