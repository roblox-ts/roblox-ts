export = () => {
	it("should support string methods", () => {
		expect("Hello, world".sub(0, 0)).to.equal("H");
	});

	it("should support string methods on identifiers", () => {
		const str = "Hello, world";
		expect(str.sub(0, 0)).to.equal("H");
	});

	it("should support string.slice", () => {
		const str = "Hello, world";
		expect(str.slice(0, 1)).to.equal("H");
		expect("Hello, world".slice(0, 1)).to.equal("H");
	});

	it("should support string.split", () => {
		function checkLen<T>(len: number, arr: Array<T>) {
			expect(arr.size()).to.equal(len);
			return arr;
		}

		const str = "Hello, world";
		const chars = str.byte(0, -1).map(i => string.char(i));
		const words = ["Hello", "world"];
		const hSplit = ["", "ello, world"];

		expect(str.split("").every((char, i) => char === chars[i])).to.equal(true);
		expect(str.split(", ").every((word, i) => word === words[i])).to.equal(true);
		expect(str.split("H").every((word, i) => word === hSplit[i])).to.equal(true);
		expect(checkLen(1, "".split("a"))[0]).to.equal("");

		for (let i = 2; i < 10; i++) {
			const str = "d".rep(i - 1);
			const str1 = str.split("d");
			expect(str1.size()).to.equal(i);
			expect(str1.every(c => c === "")).to.equal(true);
		}

		expect("".split("").isEmpty()).to.equal(true);

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

	it("should support calling gmatch", () => {
		expect("Hello".gmatch(".")()).to.equal("H");
	});

	it("should support the spread operator on strings", () => {
		const array4 = ["H", "i", "y", "a"];
		expect([..."Hiya"].every((x, i) => x === array4[i])).to.equal(true);
	});

	it("should support string.find", () => {
		const data = "Hello".find("H", 0, true);
		if (data[0]) {
			expect(data[0]).to.equal(0);
			expect(data[1]).to.equal(0);
		}

		const data2 = "Hello".find("e", 1, true);
		if (data2[0]) {
			expect(data2[0]).to.equal(1);
			expect(data2[1]).to.equal(1);
		}
	});

	it("should support concatenating strings", () => {
		expect("a" + 1 + true + false).to.equal("a1truefalse");
	});

	it("should support string.padStart", () => {
		expect("".padStart(1)).to.equal(" ");
		expect("Hello".padStart(6)).to.equal(" Hello");
		let i = 6;
		expect("Hello".padStart(i)).to.equal(" Hello");
		let j = 5;
		expect("Hello".padStart(j + 1)).to.equal(" Hello");
		expect("Hello".padStart(6, "!")).to.equal("!Hello");
	});

	it("should support string.padEnd", () => {
		expect("".padEnd(1)).to.equal(" ");
		expect("Hello".padEnd(6)).to.equal("Hello ");
		let i = 6;
		expect("Hello".padEnd(i)).to.equal("Hello ");
		let j = 5;
		expect("Hello".padEnd(j + 1)).to.equal("Hello ");
		expect("Hello".padEnd(6, "!")).to.equal("Hello!");
	});

	it("should support variable string indices", () => {
		let i = 0;
		let j = 2;
		expect("foobar".sub(i, j)).to.equal("foo");
	});

	it("should support proper destructuring and iterating", () => {
		function compare(results: Array<string>, array2: Array<string>) {
			for (const [i, v] of array2.entries()) {
				expect(results[i]).to.equal(v);
			}
		}

		// optimized destructuring
		compare([..."𝟘𝟙𝟚𝟛"], ["𝟘", "𝟙", "𝟚", "𝟛"]);
		compare([..."யாமறிந்த"], ["ய", "ா", "ம", "ற", "ி", "ந", "்", "த"]);

		const spreadString = (str: string) => [...str];

		// run-time destructuring
		compare(spreadString("𝟘𝟙𝟚𝟛"), ["𝟘", "𝟙", "𝟚", "𝟛"]);
		compare(spreadString("யாமறிந்த"), ["ய", "ா", "ம", "ற", "ி", "ந", "்", "த"]);

		let i = 0;
		for (const substr of "𝟘𝟙𝟚𝟛") {
			expect(substr).to.equal(["𝟘", "𝟙", "𝟚", "𝟛"][i++]);
		}

		let j = 0;
		let myStr = "யாமறிந்த";
		for (const substr of myStr) {
			expect(substr).to.equal(["ய", "ா", "ம", "ற", "ி", "ந", "்", "த"][j++]);
		}
	});

	it("should support string.StartsWith and string.EndsWith", () => {
		expect("Hello".startsWith("He")).to.equal(true);
		expect("Hello".startsWith("He")).to.equal(true);

		const assertEquals = (item1: unknown, item2: unknown) => item1 === item2;

		assertEquals("abc".startsWith(""), true);
		assertEquals("abc".startsWith("\0"), false);
		assertEquals("abc".startsWith("a"), true);
		assertEquals("abc".startsWith("b"), false);
		assertEquals("abc".startsWith("ab"), true);
		assertEquals("abc".startsWith("bc"), false);
		assertEquals("abc".startsWith("abc"), true);
		assertEquals("abc".startsWith("bcd"), false);
		assertEquals("abc".startsWith("abcd"), false);
		assertEquals("abc".startsWith("bcde"), false);

		const NaN = 0 / 0;
		const Infinity = 1 / 0;

		assertEquals("abc".startsWith("", NaN), true);
		assertEquals("abc".startsWith("\0", NaN), false);
		assertEquals("abc".startsWith("a", NaN), true);
		assertEquals("abc".startsWith("b", NaN), false);
		assertEquals("abc".startsWith("ab", NaN), true);
		assertEquals("abc".startsWith("bc", NaN), false);
		assertEquals("abc".startsWith("abc", NaN), true);
		assertEquals("abc".startsWith("bcd", NaN), false);
		assertEquals("abc".startsWith("abcd", NaN), false);
		assertEquals("abc".startsWith("bcde", NaN), false);

		assertEquals("abc".startsWith("", undefined), true);
		assertEquals("abc".startsWith("\0", undefined), false);
		assertEquals("abc".startsWith("a", undefined), true);
		assertEquals("abc".startsWith("b", undefined), false);
		assertEquals("abc".startsWith("ab", undefined), true);
		assertEquals("abc".startsWith("bc", undefined), false);
		assertEquals("abc".startsWith("abc", undefined), true);
		assertEquals("abc".startsWith("bcd", undefined), false);
		assertEquals("abc".startsWith("abcd", undefined), false);
		assertEquals("abc".startsWith("bcde", undefined), false);

		assertEquals("abc".startsWith("", -Infinity), true);
		assertEquals("abc".startsWith("\0", -Infinity), false);
		assertEquals("abc".startsWith("a", -Infinity), true);
		assertEquals("abc".startsWith("b", -Infinity), false);
		assertEquals("abc".startsWith("ab", -Infinity), true);
		assertEquals("abc".startsWith("bc", -Infinity), false);
		assertEquals("abc".startsWith("abc", -Infinity), true);
		assertEquals("abc".startsWith("bcd", -Infinity), false);
		assertEquals("abc".startsWith("abcd", -Infinity), false);
		assertEquals("abc".startsWith("bcde", -Infinity), false);

		assertEquals("abc".startsWith("", -1), true);
		assertEquals("abc".startsWith("\0", -1), false);
		assertEquals("abc".startsWith("a", -1), true);
		assertEquals("abc".startsWith("b", -1), false);
		assertEquals("abc".startsWith("ab", -1), true);
		assertEquals("abc".startsWith("bc", -1), false);
		assertEquals("abc".startsWith("abc", -1), true);
		assertEquals("abc".startsWith("bcd", -1), false);
		assertEquals("abc".startsWith("abcd", -1), false);
		assertEquals("abc".startsWith("bcde", -1), false);

		assertEquals("abc".startsWith("", -0), true);
		assertEquals("abc".startsWith("\0", -0), false);
		assertEquals("abc".startsWith("a", -0), true);
		assertEquals("abc".startsWith("b", -0), false);
		assertEquals("abc".startsWith("ab", -0), true);
		assertEquals("abc".startsWith("bc", -0), false);
		assertEquals("abc".startsWith("abc", -0), true);
		assertEquals("abc".startsWith("bcd", -0), false);
		assertEquals("abc".startsWith("abcd", -0), false);
		assertEquals("abc".startsWith("bcde", -0), false);

		assertEquals("abc".startsWith("", +0), true);
		assertEquals("abc".startsWith("\0", +0), false);
		assertEquals("abc".startsWith("a", +0), true);
		assertEquals("abc".startsWith("b", +0), false);
		assertEquals("abc".startsWith("ab", +0), true);
		assertEquals("abc".startsWith("bc", +0), false);
		assertEquals("abc".startsWith("abc", +0), true);
		assertEquals("abc".startsWith("bcd", +0), false);
		assertEquals("abc".startsWith("abcd", +0), false);
		assertEquals("abc".startsWith("bcde", +0), false);

		assertEquals("abc".startsWith("", 1), true);
		assertEquals("abc".startsWith("\0", 1), false);
		assertEquals("abc".startsWith("a", 1), false);
		assertEquals("abc".startsWith("b", 1), true);
		assertEquals("abc".startsWith("ab", 1), false);
		assertEquals("abc".startsWith("bc", 1), true);
		assertEquals("abc".startsWith("abc", 1), false);
		assertEquals("abc".startsWith("bcd", 1), false);
		assertEquals("abc".startsWith("abcd", 1), false);
		assertEquals("abc".startsWith("bcde", 1), false);

		assertEquals("abc".startsWith("", +Infinity), true);
		assertEquals("abc".startsWith("\0", +Infinity), false);
		assertEquals("abc".startsWith("a", +Infinity), false);
		assertEquals("abc".startsWith("b", +Infinity), false);
		assertEquals("abc".startsWith("ab", +Infinity), false);
		assertEquals("abc".startsWith("bc", +Infinity), false);
		assertEquals("abc".startsWith("abc", +Infinity), false);
		assertEquals("abc".startsWith("bcd", +Infinity), false);
		assertEquals("abc".startsWith("abcd", +Infinity), false);
		assertEquals("abc".startsWith("bcde", +Infinity), false);

		assertEquals("[a-z]+(bar)?".startsWith("[a-z]+"), true);
		assertEquals("[a-z]+(bar)?".startsWith("(bar)?", 6), true);

		// https://mathiasbynens.be/notes/javascript-unicode#poo-test
		const string = "I\xF1t\xEBrn\xE2ti\xF4n\xE0liz\xE6ti\xF8n\u2603\u{1F4A9}";
		assertEquals(string.startsWith(""), true);
		assertEquals(string.startsWith("\xF1t\xEBr"), false);
		assertEquals(string.startsWith("\xF1t\xEBr", 1), true);
		assertEquals(string.startsWith("\xE0liz\xE6"), false);
		assertEquals(string.startsWith("\xE0liz\xE6", 11), true);
		assertEquals(string.startsWith("\xF8n\u{2603}\u{1F4A9}"), false);
		assertEquals(string.startsWith("\xF8n\u{2603}\u{1F4A9}", 18), true);
		assertEquals(string.startsWith("\u{2603}"), false);
		assertEquals(string.startsWith("\u{2603}", 20), true);
		assertEquals(string.startsWith("\u{1F4A9}"), false);
		assertEquals(string.startsWith("\u{1F4A9}", 21), true);
	});
};
