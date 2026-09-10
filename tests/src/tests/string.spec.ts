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
		expect("Hello".gmatch(".")()[0]).to.equal("H");
	});

	it("should support the spread operator on strings", () => {
		const array4 = ["H", "i", "y", "a"];
		expect([..."Hiya"].every((x, i) => x === array4[i])).to.equal(true);
	});

	it("should support string.find", () => {
		const data = "Hello".find("H", 1, true);
		if (data[0]) {
			expect(data[0]).to.equal(1);
			expect(data[1]).to.equal(1);
		}

		const data2 = "Hello".find("e", 2, true);
		if (data2[0]) {
			expect(data2[0]).to.equal(2);
			expect(data2[1]).to.equal(2);
		}
	});

	it("should support concatenating strings", () => {
		expect("a" + 1 + true + false).to.equal("a1truefalse");
	});

	it("should support variable string indices", () => {
		let i = 1;
		let j = 3;
		expect("foobar".sub(i, j)).to.equal("foo");
	});

	it("should support proper destructuring and iterating", () => {
		function compare(results: Array<string>, array2: Array<string>) {
			for (let i = 0; i < array2.size(); i++) {
				expect(results[i]).to.equal(array2[i]);
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

	it("should support multiline strings as an object index", () => {
		const key = `str
			ing`;

		const obj = {
			[`str
			ing`]: "foo",
		};

		// prettier-ignore
		expect(obj[`str
			ing`]).to.equal("foo");
		expect(obj[key]).to.equal("foo");

		// prettier-ignore
		obj[`str
			ing`] = "bar";

		// prettier-ignore
		expect(obj[`str
			ing`]).to.equal("bar");
		expect(obj[key]).to.equal("bar");
	});

	// issue #1467
	it("should support strings with \", ', and ending with ]", () => {
		const str1 = `A string with a " and ' ending in a ]`;
		expect(str1.size()).to.equal(37);

		const str2 = `A string with a " and ' ending in a ]] ]=`;
		expect(str2.size()).to.equal(41);
	});

	it("should support string indexing", () => {
		const str1 = "Hello, world!";
		expect(str1[0]).to.equal("H");
		expect(str1[13]).to.equal(undefined);

		const str2 = "I like 苺";
		expect(str2[7]).to.equal(string.char(0xe8));

		const str3 = "However, 西瓜 is awesome too";
		expect(str3[9]).to.equal(string.char(0xe8));
		expect(str3[16]).to.equal("i");

		const str4 = "😂 that was fun!";
		expect(str4[5]).to.equal("t");
	});

	it("should return undefined for invalid string indices", () => {
		function read(value: string, index: number) {
			return value[index];
		}

		expect(read("abc", -1)).to.equal(undefined);
		expect(read("abc", -2)).to.equal(undefined);
		expect(read("abc", -0.5)).to.equal(undefined);
		expect(read("abc", 0.5)).to.equal(undefined);
		expect(read("abc", 3)).to.equal(undefined);
		expect(read("abc", math.huge)).to.equal(undefined);
		expect(read("abc", -math.huge)).to.equal(undefined);
		expect(read("abc", 0 / 0)).to.equal(undefined);
		expect(read("", 0)).to.equal(undefined);
		expect(read("abc", -0)).to.equal("a");
		expect(read("abc", 2)).to.equal("c");
		expect("abc"[-2]).to.equal(undefined);
		expect("abc"[0.5]).to.equal(undefined);
		expect("abc"[3] ?? "fallback").to.equal("fallback");
	});

	it("should index every UTF-8 byte including null bytes", () => {
		const value = "🍓\0";

		expect(value[0]).to.equal(string.char(0xf0));
		expect(value[1]).to.equal(string.char(0x9f));
		expect(value[2]).to.equal(string.char(0x8d));
		expect(value[3]).to.equal(string.char(0x93));
		expect(value[4]).to.equal(string.char(0));
		expect(value[5]).to.equal(undefined);
	});

	it("should evaluate a string index call once", () => {
		let calls = 0;
		function getIndex() {
			return calls++;
		}

		const value = "abcd"[getIndex()];

		expect(value).to.equal("a");
		expect(calls).to.equal(1);
	});

	it("should evaluate a string receiver before its index", () => {
		let events = "";
		function getValue() {
			events += "s";
			return "abc";
		}
		function getIndex() {
			events += "i";
			return 0;
		}

		const value = getValue()[getIndex()];

		expect(value).to.equal("a");
		expect(events).to.equal("si");
	});

	it("should preserve a string receiver when the index rebinds it", () => {
		let value = "abc";
		function getIndex() {
			value = "xyz";
			return 0;
		}

		const byte = value[getIndex()];

		expect(byte).to.equal("a");
		expect(value).to.equal("xyz");
	});

	it("should preserve receiver order before string index prerequisites", () => {
		let index = 0;
		function getValue() {
			expect(index).to.equal(0);
			return "abc";
		}

		const byte = getValue()[index++];

		expect(byte).to.equal("a");
		expect(index).to.equal(1);
	});

	it("should preserve side effects of discarded string indexing", () => {
		let events = "";
		function getValue() {
			events += "s";
			return "abc";
		}
		function getIndex() {
			events += "i";
			return 0;
		}

		getValue()[getIndex()];
		expect(events).to.equal("si");

		events = "";
		getValue()[-1];
		expect(events).to.equal("s");
	});

	it("should stop string indexing after a receiver error", () => {
		let calls = 0;
		function getValue(): string {
			throw "receiver error";
		}
		function getIndex() {
			calls++;
			return 0;
		}

		const [success] = pcall(() => getValue()[getIndex()]);

		expect(success).to.equal(false);
		expect(calls).to.equal(0);
	});

	it("should index optional strings only when present", () => {
		let calls = 0;
		function getIndex() {
			calls++;
			return 0;
		}
		function read(value: string | undefined) {
			return value?.[getIndex()];
		}

		expect(read(undefined)).to.equal(undefined);
		expect(calls).to.equal(0);
		expect(read("abc")).to.equal("a");
		expect(calls).to.equal(1);
		expect(read("")).to.equal(undefined);
		expect(calls).to.equal(2);
	});

	it("should index string constraints and narrowed unions", () => {
		function readGeneric<T extends string>(value: T, index: number) {
			return value[index];
		}
		function readUnion(value: string | Array<string>) {
			if (typeIs(value, "string")) {
				return value[0];
			}
			return value[0];
		}

		expect(readGeneric("abc", 1)).to.equal("b");
		expect(readUnion("abc")).to.equal("a");
		expect(readUnion(["xyz"])).to.equal("xyz");
	});

	it("should support numeric string index keys", () => {
		let calls = 0;
		function getIndex(): "0" | "1" {
			calls++;
			return "1";
		}
		function read(index: "0" | "NaN") {
			return "abc"[index];
		}

		expect("abc"["0"]).to.equal("a");
		expect("abc"[getIndex()]).to.equal("b");
		expect(calls).to.equal(1);
		expect(read("0")).to.equal("a");
		expect(read("NaN")).to.equal(undefined);
	});

	it("should use byte indexing for numeric object binding keys", () => {
		const { 0: first, "1": second, 2: third, 3: missing = "fallback" } = "苺";

		expect(first).to.equal(string.char(0xe8));
		expect(second).to.equal(string.char(0x8b));
		expect(third).to.equal(string.char(0xba));
		expect(missing).to.equal("fallback");
	});

	it("should evaluate computed string object binding keys once", () => {
		let calls = 0;
		function getIndex() {
			return calls++;
		}

		const { [getIndex()]: first, [getIndex()]: second } = "abc";

		expect(first).to.equal("a");
		expect(second).to.equal("b");
		expect(calls).to.equal(2);
	});

	it("should use byte indexing for numeric object assignment keys", () => {
		let first = "";
		let second = "";
		let index = 1;

		({ 0: first, [index++]: second } = "苺");

		expect(first).to.equal(string.char(0xe8));
		expect(second).to.equal(string.char(0x8b));
		expect(index).to.equal(2);
	});

	it("should terminate indexed string traversal at undefined", () => {
		const value = "abc";
		let result = "";

		for (let index = 0; value[index] !== undefined; index++) {
			result += value[index];
		}

		expect(result).to.equal(value);
	});

	it("should preserve escapes in strings containing both quote characters", () => {
		expect("a\\b'\"c").to.equal(string.char(97, 92, 98, 39, 34, 99));
		expect("a\u005cb'\"c").to.equal(string.char(97, 92, 98, 39, 34, 99));
		expect("a'\"123").to.equal(string.char(97, 39, 34, 49, 50, 51));
		// prettier-ignore
		expect("a\
b'\"c").to.equal(string.char(97, 98, 39, 34, 99));
		// prettier-ignore
		expect('a\\b\'"c').to.equal(string.char(97, 92, 98, 39, 34, 99));
		expect("a\nb'\"c").to.equal(string.char(97, 10, 98, 39, 34, 99));
		expect("a\r\nb'\"c").to.equal(string.char(97, 13, 10, 98, 39, 34, 99));
		expect("a\0b'\"c").to.equal(string.char(97, 0, 98, 39, 34, 99));
		expect("a\x01b'\"c").to.equal(string.char(97, 1, 98, 39, 34, 99));
		expect("a\\\"'b").to.equal(string.char(97, 92, 34, 39, 98));
	});

	it("should preserve escaped strings in table keys and set members", () => {
		const key = string.char(97, 92, 98, 39, 34, 99);
		const object: { [key: string]: number } = { "a\\b'\"c": 1 };
		expect(object[key]).to.equal(1);
		expect(object["a\\b'\"c"]).to.equal(1);
		expect(new Set(["a\\b'\"c"]).has(key)).to.equal(true);
	});

	it("should preserve decoded strings from tagged templates and enum constants", () => {
		function tag(strings: TemplateStringsArray) {
			return strings[0];
		}
		const enum Strings {
			Mixed = "a\\b'\"c",
		}
		const expected = string.char(97, 92, 98, 39, 34, 99);
		expect(tag`a\\b'"c`).to.equal(expected);
		expect(Strings.Mixed).to.equal(expected);
	});

	it("should translate TypeScript-only escapes without changing their values", () => {
		expect("\uD83D\uDE00").to.equal("😀");
		expect("\\uD83D\\uDE00").to.equal(string.char(92) + "uD83D" + string.char(92) + "uDE00");
		expect("\u{00000041}").to.equal("A");
		// prettier-ignore
		expect("\a\z\/\$\`\{\}").to.equal("az/$`{}");
	});
};
