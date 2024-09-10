function difference<T>(set1: Set<T>, set2: Set<T>): Set<T> {
	const result = new Set<T>();
	for (const value of set1) {
		if (!set2.has(value)) {
			result.add(value);
		}
	}
	for (const value of set2) {
		if (!set1.has(value)) {
			result.add(value);
		}
	}
	return result;
}

export = () => {
	it("should support numeric for loops", () => {
		const hit = new Set<number>();
		let sum = 10;
		for (let i = 0; i < 10; i++) {
			hit.add(i);
			sum--;
		}
		expect(sum).to.equal(0);
		expect(hit.has(0)).to.equal(true);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
		expect(hit.has(4)).to.equal(true);
		expect(hit.has(5)).to.equal(true);
		expect(hit.has(6)).to.equal(true);
		expect(hit.has(7)).to.equal(true);
		expect(hit.has(8)).to.equal(true);
		expect(hit.has(9)).to.equal(true);
	});

	it("should support optimized simple loops #1", () => {
		const hit = new Set<number>();
		let n = 0;
		for (let i = 1; i <= 3; i++) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support optimized simple loops #2", () => {
		const hit = new Set<number>();
		let n = 0;
		for (let i = 3; i >= 1; i--) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support optimized simple loops #3", () => {
		const hit = new Set<number>();
		let n = 0;
		for (let i = 1; i <= 3; i = i + 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support optimized simple loops #4", () => {
		const hit = new Set<number>();
		let n = 0;
		for (let i = 3; i >= 1; i = i - 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support optimized simple loops #5", () => {
		const hit = new Set<number>();
		let n = 0;
		for (let i = 1; i <= 3; i += 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support optimized simple loops #6", () => {
		const hit = new Set<number>();
		const limit = 1;
		let n = 0;
		for (let i = 3; i >= limit; i -= 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support optimized simple loops #7", () => {
		const hit = new Set<number>();
		const limit = 1;
		let n = 0;
		for (let i = 3; i <= limit; i -= 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(0);
		expect(hit.has(1)).to.equal(false);
		expect(hit.has(2)).to.equal(false);
		expect(hit.has(3)).to.equal(false);

		for (let i = 3; i >= limit; i -= 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support optimized simple loops #8", () => {
		const hit = new Set<number>();
		let n = 0;
		for (let i = 3; i <= 1; i -= 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(0);
		expect(hit.has(1)).to.equal(false);
		expect(hit.has(2)).to.equal(false);
		expect(hit.has(3)).to.equal(false);

		for (let i = 3; i >= 1; i -= 1) {
			hit.add(i);
			n++;
		}
		expect(n).to.equal(3);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
	});

	it("should support for-of loops over arrays", () => {
		const hit = new Set<string>();
		const array = ["1", "2", "3", "4"];
		let n = 0;
		for (const v of array) {
			hit.add(v);
			n++;
		}
		expect(n).to.equal(4);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support for-of loops over array literals", () => {
		const hit = new Set<string>();
		let n = 0;
		for (const v of ["1", "2", "3", "4"]) {
			hit.add(v);
			n++;
		}
		expect(n).to.equal(4);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support for-of loops over string literals", () => {
		const hit = new Set<string>();
		let n = 0;
		for (const v of "1234") {
			hit.add(v);
			n++;
		}
		expect(n).to.equal(4);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support for-of loops over strings", () => {
		const hit = new Set<string>();
		const str = "1234";
		let n = 0;
		for (const v of str) {
			hit.add(v);
			n++;
		}
		expect(n).to.equal(4);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support for-of loops over computed strings", () => {
		const i = 0;
		for (const letter of `${i}s`) {
		}
	});

	it("should support for-of loops over Set literals", () => {
		const hit = new Set<string>();
		let n = 0;
		for (const v of new Set(["1", "2", "3", "4"])) {
			hit.add(v);
			n++;
		}
		expect(n).to.equal(4);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support for-of loops over Sets", () => {
		const hit = new Set<string>();
		const set = new Set(["1", "2", "3", "4"]);
		let n = 0;
		for (const v of set) {
			hit.add(v);
			n++;
		}
		expect(n).to.equal(4);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support for-of loops over Map literals", () => {
		const hit = new Set<string>();
		let n = 0;
		for (const v of new Map([
			["1", "2"],
			["3", "4"],
		])) {
			hit.add(v[0]);
			hit.add(v[1]);
			n++;
		}
		expect(n).to.equal(2);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support for-of loops over Maps", () => {
		const hit = new Set<string>();
		const map = new Map([
			["1", "2"],
			["3", "4"],
		]);
		let n = 0;
		for (const v of map) {
			hit.add(v[0]);
			hit.add(v[1]);
			n++;
		}
		expect(n).to.equal(2);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support optimized destructuring in for-of loops over Maps", () => {
		const hit = new Set<string>();
		const map = new Map([
			["1", "2"],
			["3", "4"],
		]);
		let n = 0;
		for (const [k, v] of map) {
			hit.add(k);
			hit.add(v);
			n++;
		}
		expect(n).to.equal(2);
		expect(difference(hit, new Set(["1", "2", "3", "4"])).isEmpty()).to.equal(true);
	});

	it("should support destructuring optimized destructuring in for-of loops over Maps", () => {
		let n = 0;
		for (const [[i, j], [k, v]] of new Map<[string, string], [string, string]>([
			[
				["1", "2"],
				["3", "4"],
			],
		])) {
			expect(i).to.equal("1");
			expect(j).to.equal("2");
			expect(k).to.equal("3");
			expect(v).to.equal("4");
			n++;
		}
		expect(n).to.equal(1);
	});

	it("should support break", () => {
		const array = [1, 2, 3, 4, 5];
		let sum = 0;
		for (const value of array) {
			sum += value;
			if (value === 3) {
				break;
			}
		}
		expect(sum).to.equal(6);
	});

	it("should support continue", () => {
		const array = [1, 2, 3, 4];
		let sum = 0;
		for (const value of array) {
			if (value === 3) {
				continue;
			}
			sum += value;
		}
		expect(sum).to.equal(7);
	});

	it("should support continue with numeric loops", () => {
		let x = 0;
		for (let i = 0; i < 10; i++) {
			if (i % 2 === 0) {
				continue;
			}
			x++;
		}
		expect(x).to.equal(5);
	});

	it("should support do-while loops", () => {
		let x = 0;
		do {
			x += 5;
		} while (x < 25);
		expect(x).to.equal(25);

		function expect0(y: number) {
			expect(y).to.equal(0);
			return false;
		}

		const y = 0;
		do {
			const y = 1;
			expect(y).to.equal(1);
		} while (expect0(y));
	});

	it("should support while loops", () => {
		let x = 0;
		while (x < 10) {
			x++;
		}
		expect(x).to.equal(10);
	});

	it("should support for-of destructuring", () => {
		const arr = [
			{
				a: 1,
				b: 2,
				c: 3,
			},
		];
		for (const { a, b, c } of arr) {
			expect(a).to.equal(1);
			expect(b).to.equal(2);
			expect(c).to.equal(3);
		}
	});

	it("should work with gmatch", () => {
		for (const [a] of "H".gmatch(".")) {
			expect(a).to.equal("H");
		}

		for (const [a, b, c, d] of "Hello!".gmatch("(%l)(%l)(%l)(%l)")) {
			expect(a).to.equal("e");
			expect(b).to.equal("l");
			expect(c).to.equal("l");
			expect(d).to.equal("o");
		}
	});

	it("should support indexing tuple as array", () => {
		const obj = {
			a: 1,
			b: 2,
			c: 3,
		};

		for (const tuple of pairs(obj)) {
			expect(tuple[1]).to.equal(obj[tuple[0]]);
		}
	});

	it("should support iterator function with single return when indexing tuple as array", () => {
		const shortIterator: IterableFunction<LuaTuple<[boolean]>> = (() => [true] as LuaTuple<[boolean]>) as never;

		for (const tuple of shortIterator) {
			expect(tuple.size()).to.equal(1);
			break;
		}
	});

	it("should support iterator function with multiple returns when indexing tuple as array", () => {
		const longIterator: IterableFunction<LuaTuple<[boolean, boolean, boolean, boolean, boolean, boolean]>> = (() =>
			[true, true, true, true, true, true] as LuaTuple<
				[boolean, boolean, boolean, boolean, boolean, boolean]
			>) as never;
		for (const tuple of longIterator) {
			expect(tuple.size()).to.equal(6);
			break;
		}
	});

	it("should support the $range macro without step", () => {
		const hit = new Set<number>();
		let sum = 10;
		for (const i of $range(0, 9)) {
			hit.add(i);
			sum--;
		}
		expect(sum).to.equal(0);
		expect(hit.has(0)).to.equal(true);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
		expect(hit.has(4)).to.equal(true);
		expect(hit.has(5)).to.equal(true);
		expect(hit.has(6)).to.equal(true);
		expect(hit.has(7)).to.equal(true);
		expect(hit.has(8)).to.equal(true);
		expect(hit.has(9)).to.equal(true);
	});

	it("should support the $range macro with a negative step", () => {
		const hit = new Set<number>();
		let sum = 10;
		for (const i of $range(9, 0, -1)) {
			hit.add(i);
			sum--;
		}
		expect(sum).to.equal(0);
		expect(hit.has(0)).to.equal(true);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
		expect(hit.has(4)).to.equal(true);
		expect(hit.has(5)).to.equal(true);
		expect(hit.has(6)).to.equal(true);
		expect(hit.has(7)).to.equal(true);
		expect(hit.has(8)).to.equal(true);
		expect(hit.has(9)).to.equal(true);
	});

	it("should support the $range macro with a decimal step", () => {
		const hit = new Set<number>();
		let sum = 19;
		for (const i of $range(0, 9, 0.5)) {
			hit.add(i);
			sum--;
		}
		expect(sum).to.equal(0);
		expect(hit.has(0)).to.equal(true);
		expect(hit.has(0.5)).to.equal(true);
		expect(hit.has(1)).to.equal(true);
		expect(hit.has(1.5)).to.equal(true);
		expect(hit.has(2)).to.equal(true);
		expect(hit.has(2.5)).to.equal(true);
		expect(hit.has(3)).to.equal(true);
		expect(hit.has(3.5)).to.equal(true);
		expect(hit.has(4)).to.equal(true);
		expect(hit.has(4.5)).to.equal(true);
		expect(hit.has(5)).to.equal(true);
		expect(hit.has(5.5)).to.equal(true);
		expect(hit.has(6)).to.equal(true);
		expect(hit.has(6.5)).to.equal(true);
		expect(hit.has(7)).to.equal(true);
		expect(hit.has(7.5)).to.equal(true);
		expect(hit.has(8)).to.equal(true);
		expect(hit.has(8.5)).to.equal(true);
		expect(hit.has(9)).to.equal(true);
	});
};
