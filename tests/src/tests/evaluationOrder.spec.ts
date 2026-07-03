/// <reference types="@rbxts/testez/globals" />

// These tests pin down TypeScript's left-to-right evaluation order guarantees across
// macro lowering and prerequisite-statement hoisting.
// See docs/evaluation-order-redesign.md.

export = () => {
	it("should evaluate call arguments before a later argument's assignment prereq", () => {
		const seen = new Array<number>();
		function observe(a: number, b: number) {
			seen.push(a);
			seen.push(b);
		}
		let x = 1;
		observe(x, (x = 5));
		expect(seen[0]).to.equal(1);
		expect(seen[1]).to.equal(5);
		expect(x).to.equal(5);
	});

	it("should evaluate call arguments before a later compound assignment prereq", () => {
		const seen = new Array<number>();
		function observe(a: number, b: number) {
			seen.push(a);
			seen.push(b);
		}
		let y = 10;
		observe(y, (y += 7));
		expect(seen[0]).to.equal(10);
		expect(seen[1]).to.equal(17);
	});

	it("should evaluate earlier arguments before a later macro-lowered argument mutates state", () => {
		const arr = [1, 2, 3];
		const seen = new Array<defined>();
		function observe(size: number, popped: number | undefined) {
			seen.push(size);
			seen.push(popped!);
		}
		// arr.size() must be read before arr.pop() shrinks the array
		observe(arr.size(), arr.pop());
		expect(seen[0]).to.equal(3);
		expect(seen[1]).to.equal(3);
		expect(arr.size()).to.equal(2);
	});

	it("should read property arguments before a later argument mutates them", () => {
		const state = { value: 1 };
		function bump() {
			state.value = 100;
			return 2;
		}
		const seen = new Array<number>();
		function observe(a: number, b: number) {
			seen.push(a);
			seen.push(b);
		}
		observe(state.value, bump());
		expect(seen[0]).to.equal(1);
		expect(seen[1]).to.equal(2);
	});

	it("should evaluate the object of a macro call before arguments that reassign it", () => {
		let arr = [1, 2, 3];
		const original = arr;
		function swap() {
			arr = [9];
			return 4;
		}
		// TS evaluates `arr` (the object) before `swap()`, so the push must go to the
		// original array
		arr.push(swap());
		expect(original.size()).to.equal(4);
		expect(original[3]).to.equal(4);
		expect(arr.size()).to.equal(1);
	});

	it("should evaluate push arguments left-to-right before any insertion", () => {
		const arr = [10, 20];
		// both arguments must be read before the first insertion changes the array
		arr.push(arr[arr.size() - 1], arr[arr.size() - 1]);
		expect(arr.size()).to.equal(4);
		expect(arr[2]).to.equal(20);
		expect(arr[3]).to.equal(20);
	});

	it("should evaluate unshift arguments left-to-right before any insertion", () => {
		const arr = [10, 20];
		arr.unshift(arr[0], arr[arr.size() - 1]);
		expect(arr.size()).to.equal(4);
		expect(arr[0]).to.equal(10);
		expect(arr[1]).to.equal(20);
		expect(arr[2]).to.equal(10);
		expect(arr[3]).to.equal(20);
	});

	it("should pass the original array as the third callback argument even if the callback reassigns the binding", () => {
		let arr = [1, 2];
		const original = arr;
		const thirdArgs = new Array<ReadonlyArray<number>>();
		arr.forEach((value, index, source) => {
			thirdArgs.push(source);
			arr = [99];
		});
		expect(thirdArgs.size()).to.equal(2);
		expect(thirdArgs[0]).to.equal(original);
		expect(thirdArgs[1]).to.equal(original);
	});

	it("should return the original array from sort even if the comparator reassigns the binding", () => {
		let arr = [3, 1, 2];
		const original = arr;
		const sorted = arr.sort((a, b) => {
			arr = [42];
			return a < b;
		});
		expect(sorted).to.equal(original);
		expect(sorted[0]).to.equal(1);
		expect(sorted[1]).to.equal(2);
		expect(sorted[2]).to.equal(3);
	});

	it("should evaluate the map object before effectful set arguments", () => {
		let map = new Map<string, number>();
		const original = map;
		function evil() {
			map = new Map<string, number>();
			return 5;
		}
		map.set("k", evil());
		expect(original.get("k")).to.equal(5);
		expect(map.get("k")).never.to.be.ok();
	});

	it("should evaluate set.add and map.set operands in order and return the collection", () => {
		const order = new Array<string>();
		function key() {
			order.push("key");
			return "k";
		}
		function value() {
			order.push("value");
			return 1;
		}
		const map = new Map<string, number>();
		const result = map.set(key(), value());
		expect(result).to.equal(map);
		expect(order[0]).to.equal("key");
		expect(order[1]).to.equal("value");

		const set = new Set<string>();
		expect(set.add("a")).to.equal(set);
		expect(set.has("a")).to.equal(true);
	});

	it("should read the delete key before removing it", () => {
		const map = new Map<string, string>([["a", "b"]]);
		const wrapper = { key: "a" };
		const existed = map.delete(wrapper.key);
		expect(existed).to.equal(true);
		expect(map.delete(wrapper.key)).to.equal(false);
	});

	it("should evaluate template literal parts in order across prereqs", () => {
		let x = 1;
		function effect() {
			x = 50;
			return 2;
		}
		const arr = [effect];
		const text = `a${x}b${arr.pop()!()}c${x}`;
		expect(text).to.equal("a1b2c50");
	});

	it("should evaluate binary operands in order when the right side has prereqs", () => {
		let x = 3;
		const arr = [10];
		// left operand `x` must be read before `arr.pop()!` runs (and before its result is used)
		const result = x + (arr.pop()! + (x = 100) * 0);
		expect(result).to.equal(13);
		expect(x).to.equal(100);
	});

	it("should evaluate array literal elements in order across prereqs", () => {
		let x = 7;
		const arr = [1];
		const combined = [x, arr.pop()!, (x = 8)];
		expect(combined[0]).to.equal(7);
		expect(combined[1]).to.equal(1);
		expect(combined[2]).to.equal(8);
	});

	it("should evaluate reduce operands in order", () => {
		const order = new Array<string>();
		const arr = [1, 2, 3];
		function getCallback() {
			order.push("callback");
			return (acc: number, v: number) => acc + v;
		}
		function getInitial() {
			order.push("initial");
			return 10;
		}
		const total = arr.reduce(getCallback(), getInitial());
		expect(total).to.equal(16);
		expect(order[0]).to.equal("callback");
		expect(order[1]).to.equal("initial");
	});

	it("should evaluate the object before arguments in string macros", () => {
		const order = new Array<string>();
		function getStr() {
			order.push("object");
			return "hello";
		}
		function getIndex() {
			order.push("arg");
			return 2;
		}
		expect(getStr().sub(getIndex(), 3)).to.equal("el");
		expect(order[0]).to.equal("object");
		expect(order[1]).to.equal("arg");
	});

	it("should keep mutation position for unorderedRemove index expressions", () => {
		const arr = [0, 1, 2, 3, 4, 5, 6, 7];
		let i = 2;
		expect(arr.unorderedRemove((i *= 2))).to.equal(4);
		expect(i).to.equal(4);
		expect(arr.size()).to.equal(7);
		expect(arr[4]).to.equal(7);
	});

	it("should not mutate the array before a later throwing push argument is evaluated", () => {
		const arr = new Array<string>();
		const fmt = "%d";
		// string.format("%d", <table>) errors; TS evaluates all arguments before push
		// mutates anything, so the array must be untouched
		expect(() => arr.push("a", fmt.format([] as never))).to.throw();
		expect(arr.size()).to.equal(0);
	});

	it("should evaluate interpolated objects before later arguments' prereqs", () => {
		class Weird {
			public map = new Map<string, number>();
			public toString() {
				this.map.set("x", 1);
				return "weird";
			}
		}
		const w = new Weird();
		const seen = new Array<defined>();
		function observe(text: string, size: number) {
			seen.push(text);
			seen.push(size);
		}
		// `${w}` calls toString() (mapped to __tostring) which mutates the map, so the
		// map size read afterwards must observe the mutation
		observe(`${w}`, w.map.size());
		expect(seen[0]).to.equal("weird");
		expect(seen[1]).to.equal(1);
	});

	it("should evaluate operands of includes/indexOf inline in order", () => {
		const order = new Array<string>();
		const arr = [5, 6, 7];
		function getValue() {
			order.push("value");
			return 6;
		}
		function getFrom() {
			order.push("from");
			return 0;
		}
		expect(arr.indexOf(getValue(), getFrom())).to.equal(1);
		expect(order[0]).to.equal("value");
		expect(order[1]).to.equal("from");
	});
};
