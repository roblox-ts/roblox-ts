export = () => {
	it("should support element access", () => {
		const arr = [1, 2, 3];
		expect(arr[0]).to.equal(1);
		expect(arr[1]).to.equal(2);
		expect(arr[2]).to.equal(3);
		expect([1, 2, 3][0]).to.equal(1);
		expect([1, 2, 3][1]).to.equal(2);
		expect([1, 2, 3][2]).to.equal(3);

		function foo() {
			const result = [1, 2, 3];
			return result;
		}
		expect(foo()[0]).to.equal(1);
		expect(foo()[1]).to.equal(2);
		expect(foo()[2]).to.equal(3);

		let i = 2;
		let a = arr[i];
		let b = arr[2];
		let { [i]: c } = arr;
		let { [2]: d } = arr;

		expect(a).to.equal(3);
		expect(b).to.equal(3);
		expect(c).to.equal(3);
		expect(d).to.equal(3);

		a = arr[i];
		b = arr[2];
		({ [i]: c } = arr);
		({ [2]: d } = arr);

		expect(a).to.equal(3);
		expect(b).to.equal(3);
		expect(c).to.equal(3);
		expect(d).to.equal(3);

		function f<T extends 0 | 1 | 2 | number>(v: T) {
			let a = [];
			a[v] = 3; // shouldn't make a compiler error
		}

		enum Foo {
			A,
			B,
			C,
		}

		function g<T extends Foo>(v: T) {
			const a = [];
			a[v] = 3; // shouldn't make a compiler error
		}
	});

	it("should support.size()", () => {
		expect([].size()).to.equal(0);
		expect([1].size()).to.equal(1);
		expect([1, 2].size()).to.equal(2);
		expect([1, 2, 3].size()).to.equal(3);
	});

	it("should support push", () => {
		const a = new Array<number>();
		a.push(123);
		expect(a[0]).to.equal(123);

		class Noodle {
			public strings = new Array<string>();
		}

		const noodle = new Noodle();
		noodle.strings.push("Rigatoni");
		const strings = noodle.strings;
		strings.push("Spaghetti");

		if (strings.push("Lasagna")) {
		}

		expect(noodle.strings.push("Penne")).to.equal(4);
		expect(noodle.strings[0]).to.equal("Rigatoni");
		expect(noodle.strings[1]).to.equal("Spaghetti");
		expect(noodle.strings[2]).to.equal("Lasagna");
		expect(noodle.strings[3]).to.equal("Penne");

		let arr = [0];
		arr.push(1, 2, arr[1]);

		expect(arr[0]).to.equal(0);
		expect(arr[1]).to.equal(1);
		expect(arr[2]).to.equal(2);
		expect(arr[3]).to.equal(undefined);

		expect([1, 2].push()).to.equal(2);
	});

	it("should support pop", () => {
		const a = [456];
		const b = a.pop();
		expect(b).to.equal(456);
		expect(a.size()).to.equal(0);
		expect(a[0]).never.to.be.ok();
	});

	it("should support concat", () => {
		const a = [1, 2, 3];
		const b = [4, 5, 6];
		const c = a.concat(b);
		expect(c).never.to.equal(a);
		expect(c).never.to.equal(b);
		expect(c[0]).to.equal(1);
		expect(c[1]).to.equal(2);
		expect(c[2]).to.equal(3);
		expect(c[3]).to.equal(4);
		expect(c[4]).to.equal(5);
		expect(c[5]).to.equal(6);
	});

	it("should support join", () => {
		const a = [1, 2, 3];
		expect(a.join(", ")).to.equal("1, 2, 3");
		expect([1, 2, 3].join(", ")).to.equal("1, 2, 3");
	});

	it("should support reverse", () => {
		const a = [1, 2, 3];
		const b = a.reverse();
		expect(b).never.to.equal(a);
		expect(b[0]).to.equal(3);
		expect(b[1]).to.equal(2);
		expect(b[2]).to.equal(1);
	});

	it("should support shift", () => {
		const a = [1, 2, 3];
		const b = a.shift();
		expect(b).to.equal(1);
		expect(a.size()).to.equal(2);
		expect(a[0]).to.equal(2);
		expect(a[1]).to.equal(3);
	});

	it("should support slice", () => {
		const a = [1, 2, 3];

		const b = a.slice();
		expect(b).never.to.equal(a);
		expect(b.size()).to.equal(3);
		expect(b[0]).to.equal(1);
		expect(b[1]).to.equal(2);
		expect(b[2]).to.equal(3);

		const c = a.slice(0, 1);
		expect(c).never.to.equal(a);
		expect(c.size()).to.equal(1);
		expect(c[0]).to.equal(1);

		const d = a.slice(-2);
		expect(d).never.to.equal(a);
		expect(d.size()).to.equal(2);
		expect(d[0]).to.equal(2);
		expect(d[1]).to.equal(3);

		const e = a.slice();
		expect(e).never.to.equal(a);
		expect(e.size()).to.equal(3);
		expect(e[0]).to.equal(1);
		expect(e[1]).to.equal(2);
		expect(e[2]).to.equal(3);

		const f = a.slice(0, -1);
		expect(f).never.to.equal(a);
		expect(f.size()).to.equal(2);
		expect(f[0]).to.equal(1);
		expect(f[1]).to.equal(2);
	});

	// TODO issue #98
	it("should support sort", () => {});

	it("should support splice", () => {
		function equal<T>(a: Array<T>, b: Array<T>) {
			if (a.size() !== b.size()) {
				return false;
			}
			for (let i = 0; i < a.size(); i++) {
				if (a[i] !== b[i]) {
					return false;
				}
			}
			return true;
		}

		const months = ["Jan", "March", "April", "June"];

		months.splice(1, 0, "Feb");
		expect(equal(months, ["Jan", "Feb", "March", "April", "June"])).to.be.ok();

		months.splice(4, 1, "May");
		expect(equal(months, ["Jan", "Feb", "March", "April", "May"])).to.be.ok();
	});

	it("should support unshift", () => {
		const a = [1, 2, 3];
		const b = a.unshift(4);
		a.unshift(5);
		expect(a[0]).to.equal(5);
		expect(a[1]).to.equal(4);
		expect(a[2]).to.equal(1);
		expect(a[3]).to.equal(2);
		expect(a[4]).to.equal(3);
		expect(b).to.equal(4);
	});

	it("should support indexOf", () => {
		const a = [7, 1, 8, 1, 9];
		expect(a.indexOf(1)).to.equal(1);
		expect(a.indexOf(2)).to.equal(-1);
	});

	it("should support lastIndexOf", () => {
		const a = [7, 1, 8, 1, 9];
		expect(a.lastIndexOf(1)).to.equal(3);
		expect(a.lastIndexOf(2)).to.equal(-1);
	});

	it("should support every", () => {
		function even(value: number) {
			return value % 2 === 0;
		}

		function odd(value: number) {
			return !even(value);
		}

		const a = [1, 2, 3, 4, 5, 6];
		expect(a.every(even)).to.equal(false);
		expect(a.every(odd)).to.equal(false);

		const b = [1, 3, 5];
		expect(b.every(even)).to.equal(false);
		expect(b.every(odd)).to.equal(true);

		const c = [2, 4, 6];
		expect(c.every(even)).to.equal(true);
		expect(c.every(odd)).to.equal(false);
	});

	it("should support some", () => {
		const a = [1, 2, 3];
		expect(a.some(v => v === 2)).to.equal(true);
		expect(a.some(v => v === 4)).to.equal(false);
	});

	it("should support forEach", () => {
		const bin = [1, 2, 3];
		let str = "";
		bin.forEach(v => (str += v));
		expect(str).to.equal("123");
	});

	it("should support map", () => {
		const a = [1, 2, 3];
		const b = a.map(v => v + 1);
		expect(b).never.to.equal(a);
		expect(b[0]).to.equal(2);
		expect(b[1]).to.equal(3);
		expect(b[2]).to.equal(4);
	});

	it("should support filter", () => {
		const a = [1, 2, 3, 4, 5];
		const b = a.filter(v => v % 2 === 0);
		expect(b).never.to.equal(a);
		expect(b.size()).to.equal(2);
		expect(b[0]).to.equal(2);
		expect(b[1]).to.equal(4);
	});

	it("should support reduce", () => {
		function reducer(accum: Array<number>, value: Array<number>) {
			return accum.concat(value);
		}
		const a = [[0, 1], [2, 3], [4, 5]].reduce(reducer);
		expect(a[0]).to.equal(0);
		expect(a[1]).to.equal(1);
		expect(a[2]).to.equal(2);
		expect(a[3]).to.equal(3);
		expect(a[4]).to.equal(4);
		expect(a[5]).to.equal(5);
	});

	it("should support reduceRight", () => {
		function reducer(accum: Array<number>, value: Array<number>) {
			return accum.concat(value);
		}
		const a = [[0, 1], [2, 3], [4, 5]].reduceRight(reducer);
		expect(a[0]).to.equal(4);
		expect(a[1]).to.equal(5);
		expect(a[2]).to.equal(2);
		expect(a[3]).to.equal(3);
		expect(a[4]).to.equal(0);
		expect(a[5]).to.equal(1);
	});

	it("should support reducing empty arrays only with a initialValue parameter", () => {
		expect(() => new Array<string>().reduce((previous, current, index, arr) => previous + current)).to.throw();
		expect(
			new Array<string>().reduce((previous, current, index, arr) => {
				throw "This should never run! [1]";
			}, "a"),
		).to.equal("a");

		expect(() => new Array<string>().reduceRight((previous, current, index, arr) => previous + current)).to.throw();
		expect(
			new Array<string>().reduceRight((previous, current, index, arr) => {
				throw "This should never run! [2]";
			}, "a"),
		).to.equal("a");
	});

	it("should support reducing arrays with an undefined initialValue", () => {
		expect(
			[..."😂😄😃😊😉😍"].reduce(
				(previous: undefined | number, current, index, arr) => index + (previous || index),
				undefined,
			),
		).to.equal(16);
		expect(
			[..."😂😄😃😊😉😍"].reduceRight(
				(previous: undefined | number, current, index, arr) => index + (previous || index),
				undefined,
			),
		).to.equal(20);
		expect(
			[].reduce(() => {
				throw "Should not call the reducer function on an empty array! [1]";
			}, undefined),
		).to.equal(undefined);
		expect(
			[].reduceRight(() => {
				throw "Should not call the reducer function on an empty array! [2]";
			}, undefined),
		).to.equal(undefined);
	});

	it("should support reducing single-element arrays without calling a reducer when no initialValue is passed in", () => {
		expect(
			[4].reduce(() => {
				throw "Should not call the reducer function on a single-element array with no initialValue! [1]";
			}),
		).to.equal(4);
		expect(
			[5].reduceRight(() => {
				throw "Should not call the reducer function on a single-element array with no initialValue! [2]";
			}),
		).to.equal(5);
	});

	it("should support reducing forwards or backwards", () => {
		expect([..."abcdef"].reduce((previous, current) => previous + current)).to.equal("abcdef");
		expect([..."abcdef"].reduce((previous, current) => previous + current, " ")).to.equal(" " + "abcdef");
		expect([..."abcdef"].reduceRight((previous, current) => previous + current)).to.equal("abcdef".reverse());
		expect([..."abcdef"].reduceRight((previous, current) => previous + current, " ")).to.equal(
			" " + "abcdef".reverse(),
		);
	});

	it("should support find", () => {
		const a = [1, 2, 3, 4, 5];

		const b = a.find(v => v % 2 === 0);
		expect(b).to.equal(2);

		const c = a.find(v => v === 6);
		expect(c).never.to.be.ok();

		const d = a.find(v => v % 2 !== 0);
		expect(d).to.equal(1);
	});

	it("should allow spread", () => {
		const a = [1, 2, 3];
		const b = [...a, 4, 5, 6];
		expect(b[0]).to.equal(1);
		expect(b[1]).to.equal(2);
		expect(b[2]).to.equal(3);
		expect(b[3]).to.equal(4);
		expect(b[4]).to.equal(5);
		expect(b[5]).to.equal(6);
		expect(b.size()).to.equal(6);
		const c = [...[1], ...[2]];
		expect(c[0]).to.equal(1);
		expect(c[1]).to.equal(2);
	});

	it("should copy on spread", () => {
		const a = [1, 2, 3];
		const b = [...a];
		expect(a).never.to.equal(b);
		expect(a.size()).to.equal(b.size());
		for (let i = 0; i < a.size(); i++) {
			expect(b[i]).to.equal(a[i]);
		}
	});

	it("should unpack spread into function calls", () => {
		function foo(...args: Array<number>) {
			expect(args[0]).to.equal(1);
			expect(args[1]).to.equal(2);
			expect(args[2]).to.equal(3);
		}
		foo(...[1, 2, 3]);
	});

	it("should support findIndex", () => {
		const array1 = [5, 12, 8, 130, 44];
		expect(array1.findIndex(element => element > 13)).to.equal(3);

		function isPrime(element: number) {
			let start = 2;
			while (start <= math.sqrt(element)) {
				if (element % start < 1) {
					return false;
				} else {
					start++;
				}
			}
			return element > 1;
		}

		expect([4, 6, 8, 12].findIndex(isPrime)).to.equal(-1); // -1, not found
		expect([4, 6, 7, 12].findIndex(isPrime)).to.equal(2); // 2 (array[2] is 7)

		const fruits = ["apple", "banana", "cantaloupe", "blueberries", "grapefruit"];

		const index = fruits.findIndex(fruit => fruit === "blueberries");
		expect(index).to.equal(3);
		expect(fruits[index]).to.equal("blueberries");
	});

	it("should support sort", () => {
		const months = ["March", "Jan", "Feb", "Dec"].sort();
		expect(months[0]).to.equal("Dec");
		expect(months[1]).to.equal("Feb");
		expect(months[2]).to.equal("Jan");
		expect(months[3]).to.equal("March");

		const array1 = [1, 30, 4, 21, 100000].sort();
		expect(array1[0]).to.equal(1);
		expect(array1[1]).to.equal(100000);
		expect(array1[2]).to.equal(21);
		expect(array1[3]).to.equal(30);
		expect(array1[4]).to.equal(4);
	});

	it("should support flat", () => {
		const arr1 = [1, 2, [3, 4]];
		const x = arr1.flat();
		expect(x[0]).to.equal(1);
		expect(x[1]).to.equal(2);
		expect(x[2]).to.equal(3);
		expect(x[3]).to.equal(4);

		const arr2 = [1, 2, [3, 4, [5, 6]]];
		const y = arr2.flat(1) as [number, number, number, number, [number, number]];
		expect(y[0]).to.equal(1);
		expect(y[1]).to.equal(2);
		expect(y[2]).to.equal(3);
		expect(y[3]).to.equal(4);
		expect(y[4][0]).to.equal(5);
		expect(y[4][1]).to.equal(6);
		// [1, 2, 3, 4, [5, 6]]

		const arr3 = [1, 2, [3, 4, [5, 6]]];
		const z = arr3.flat(2);

		expect(z[0]).to.equal(1);
		expect(z[1]).to.equal(2);
		expect(z[2]).to.equal(3);
		expect(z[3]).to.equal(4);
		expect(z[4]).to.equal(5);
		expect(z[5]).to.equal(6);
		// [1, 2, 3, 4, 5, 6]

		const arr4 = [1, 2, 4, 5];
		const a = arr4.flat();
		// [1, 2, 4, 5]
		expect(a[0]).to.equal(1);
		expect(a[1]).to.equal(2);
		expect(a[2]).to.equal(4);
		expect(a[3]).to.equal(5);
	});

	it("should support copyWithin", () => {
		const array1 = ["a", "b", "c", "d", "e"];

		// copy to index 0 the element at index 3
		array1.copyWithin(0, 3, 4);
		// expected output: Array ["d", "b", "c", "d", "e"]
		expect(array1[0]).to.equal("d");
		expect(array1[1]).to.equal("b");
		expect(array1[2]).to.equal("c");
		expect(array1[3]).to.equal("d");
		expect(array1[4]).to.equal("e");

		// copy to index 1 all elements from index 3 to the end
		array1.copyWithin(1, 3);
		// expected output: Array ["d", "d", "e", "d", "e"]

		expect(array1[0]).to.equal("d");
		expect(array1[1]).to.equal("d");
		expect(array1[2]).to.equal("e");
		expect(array1[3]).to.equal("d");
		expect(array1[4]).to.equal("e");

		const a = [1, 2, 3, 4, 5].copyWithin(-2);
		// [1, 2, 3, 1, 2]
		expect(a[0]).to.equal(1);
		expect(a[1]).to.equal(2);
		expect(a[2]).to.equal(3);
		expect(a[3]).to.equal(1);
		expect(a[4]).to.equal(2);

		const b = [1, 2, 3, 4, 5].copyWithin(0, 3);
		// [4, 5, 3, 4, 5]
		expect(b[0]).to.equal(4);
		expect(b[1]).to.equal(5);
		expect(b[2]).to.equal(3);
		expect(b[3]).to.equal(4);
		expect(b[4]).to.equal(5);

		const c = [1, 2, 3, 4, 5].copyWithin(0, 3, 4);
		// [4, 2, 3, 4, 5]
		expect(c[0]).to.equal(4);
		expect(c[1]).to.equal(2);
		expect(c[2]).to.equal(3);
		expect(c[3]).to.equal(4);
		expect(c[4]).to.equal(5);

		const d = [1, 2, 3, 4, 5].copyWithin(-2, -3, -1);
		// [1, 2, 3, 3, 4]
		expect(d[0]).to.equal(1);
		expect(d[1]).to.equal(2);
		expect(d[2]).to.equal(3);
		expect(d[3]).to.equal(3);
		expect(d[4]).to.equal(4);
	});

	it("should support toString", () => {
		const x = [1, 2, 3];
		expect([1, 2, 4].toString()).to.be.ok();
		expect(typeOf(x.toString())).to.equal("string");
	});

	it("should support isEmpty", () => {
		new Array<string>().isEmpty();
		const v = new Array<string>().isEmpty();
		const arr = new Array<string>();
		arr.isEmpty();
		const x = arr.isEmpty();

		expect(v).to.equal(true);
		arr.push("Nope");
		expect(arr.isEmpty()).to.equal(false);
	});

	it("should support unorderedRemove", () => {
		const arr = [0, 1, 2, 3, 4, 5, 6, 7];
		let i = 2;
		let value: number;

		expect(arr.unorderedRemove((i *= 2))).to.equal(4);
		expect(arr.size()).to.equal(7);
		expect(arr[4]).to.equal(7);
		expect(arr[6]).to.equal(6);
	});

	it("should support array.entries", () => {
		function array_entries<T>(arr: Array<T>) {
			let i = 0;
			const results = new Array<[number, T]>();
			for (const v of arr) {
				results.push([i++, v]);
			}
			return results;
		}

		function compare<T>(results: Array<[number, T]>, array2: Array<[number, T]>) {
			let x = 0;
			for (const [i, v] of array2) {
				const { [x++]: pair } = results;
				expect(pair[0]).to.equal(i);
				expect(pair[1]).to.equal(v);
			}
		}

		const arr = [..."Hello, world!"];
		compare(array_entries(arr), arr.entries());
	});

	it("should support spreading non-apparent types", () => {
		type TypeGuard<T> = (value: unknown) => value is T;
		type StaticArguments<T> = T extends [TypeGuard<infer A>]
			? [A]
			: T extends [TypeGuard<infer A>, TypeGuard<infer B>]
			? [A, B]
			: T extends [TypeGuard<infer A>, TypeGuard<infer B>, TypeGuard<infer C>]
			? [A, B, C]
			: T extends [TypeGuard<infer A>, TypeGuard<infer B>, TypeGuard<infer C>, TypeGuard<infer D>]
			? [A, B, C, D]
			: T extends [
					TypeGuard<infer A>,
					TypeGuard<infer B>,
					TypeGuard<infer C>,
					TypeGuard<infer D>,
					TypeGuard<infer E>,
			  ]
			? [A, B, C, D, E]
			: T extends [
					TypeGuard<infer A>,
					TypeGuard<infer B>,
					TypeGuard<infer C>,
					TypeGuard<infer D>,
					TypeGuard<infer E>,
					TypeGuard<infer F>,
			  ]
			? [A, B, C, D, E, F]
			: T extends [
					TypeGuard<infer A>,
					TypeGuard<infer B>,
					TypeGuard<infer C>,
					TypeGuard<infer D>,
					TypeGuard<infer E>,
					TypeGuard<infer F>,
					TypeGuard<infer G>,
			  ]
			? [A, B, C, D, E, F, G]
			: T extends [
					TypeGuard<infer A>,
					TypeGuard<infer B>,
					TypeGuard<infer C>,
					TypeGuard<infer D>,
					TypeGuard<infer E>,
					TypeGuard<infer F>,
					TypeGuard<infer G>,
					TypeGuard<infer H>,
			  ]
			? [A, B, C, D, E, F, G, H]
			: Array<unknown>; // default, if user has more than 8 args then wtf they doing with their lives?!?

		function f<C extends Array<any>>(arr: StaticArguments<C>) {
			return [...arr];
		}

		f([0, 1]);
	});

	it("should support Array constructor", () => {
		expect(new Array(10).isEmpty()).to.equal(true);
	});
};
