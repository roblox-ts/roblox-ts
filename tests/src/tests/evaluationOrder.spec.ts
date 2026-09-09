/// <reference types="@rbxts/testez/globals" />

export = () => {
	it("should preserve the identity macro value", () => {
		expect(identity(5)).to.equal(5);
	});

	it("should preserve table.find errors before later local writes", () => {
		let value = 0;
		function observe(found: boolean | number, assigned: number) {
			return found !== false && assigned > 0;
		}
		const badIndex = 0 / 0;
		const [includesSuccess] = pcall(() => observe([1].includes(1, badIndex), (value = 1)));
		expect(includesSuccess).to.equal(false);
		expect(value).to.equal(0);

		const [indexOfSuccess] = pcall(() => observe([1].indexOf(1, badIndex), (value = 1)));
		expect(indexOfSuccess).to.equal(false);
		expect(value).to.equal(0);
	});

	it("should preserve tuple select errors before later local writes", () => {
		function values(): LuaTuple<Array<number>> {
			return [1, 2] as unknown as LuaTuple<Array<number>>;
		}
		let value = 0;
		function observe(selected: number, assigned: number) {
			return selected + assigned;
		}
		const badIndex = 0 / 0;
		const [success] = pcall(() => observe(values()[badIndex], (value = 1)));
		expect(success).to.equal(false);
		expect(value).to.equal(0);
	});

	it("should keep user-derived fresh-table key errors ordered", () => {
		let value = 0;
		function setValue() {
			value = 1;
			return 0;
		}
		const badKey = 0 / 0;
		const map = new Map<string, number>();
		function observe(first: number, object: { [key: number]: number }) {
			return first + object[1];
		}
		const [success] = pcall(() => observe(setValue(), { [badKey]: map.size() }));
		expect(success).to.equal(false);
		expect(value).to.equal(1);
	});

	it("should preserve immutable datatype construction errors before later local writes", () => {
		let value = 0;
		function observe(range: NumberRange, assigned: number) {
			return range.Min + assigned;
		}
		const [success] = pcall(() => observe(new NumberRange(undefined as never), (value = 1)));
		expect(success).to.equal(false);
		expect(value).to.equal(0);
	});

	it("should preserve immutable datatype method errors before later local writes", () => {
		let value = 0;
		function observe(frame: CFrame, assigned: number) {
			return frame.X + assigned;
		}
		const frame = new CFrame();
		const [success] = pcall(() => observe(frame.ToObjectSpace(undefined as never), (value = 1)));
		expect(success).to.equal(false);
		expect(value).to.equal(0);
	});

	it("should preserve immutable datatype static errors before later local writes", () => {
		let value = 0;
		function observe(color: Color3, assigned: number) {
			return color.R > 0 && assigned > 0;
		}
		const [success] = pcall(() => observe(Color3.fromHex("not-a-color"), (value = 1)));
		expect(success).to.equal(false);
		expect(value).to.equal(0);
	});

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

	it("should evaluate map.set operands in order and return the collection", () => {
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
	});

	it("should return the original set from add even if the argument reassigns the binding", () => {
		let set = new Set<number>();
		const original = set;
		function evil() {
			set = new Set<number>();
			return 1;
		}
		const result = set.add(evil());
		expect(result).to.equal(original);
		expect(original.has(1)).to.equal(true);
		expect(set.has(1)).to.equal(false);
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

	it("should run gsub replacement callbacks before later argument prereqs", () => {
		const replacements = new Map<string, number>();
		const seen = new Array<defined>();
		function observe(value: string, size: number) {
			seen.push(value);
			seen.push(size);
		}
		observe(
			"x".gsub("x", () => {
				replacements.set("x", 1);
				return "y";
			})[0],
			replacements.size(),
		);
		expect(seen[0]).to.equal("y");
		expect(seen[1]).to.equal(1);
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

	it("should preserve table mutation errors before later local writes", () => {
		const frozen = table.freeze([1]) as Array<number>;
		let value = 0;
		function observe(removed: number | undefined, assigned: number) {
			return removed !== undefined && assigned > 0;
		}
		const [success] = pcall(() => observe(frozen.shift(), (value = 1)));
		expect(success).to.equal(false);
		expect(value).to.equal(0);
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

	it("should map the original array even if the callback expression reassigns the binding", () => {
		let arr = [1, 2, 3];
		function getCallback() {
			arr = [100];
			return (v: number) => v * 2;
		}
		const mapped = arr.map(getCallback());
		expect(mapped.size()).to.equal(3);
		expect(mapped[2]).to.equal(6);
	});

	it("should pass the original array as the third argument of filter even if the callback reassigns the binding", () => {
		let arr = [1, 2, 3, 4];
		const original = arr;
		const thirdArgs = new Array<ReadonlyArray<number>>();
		const evens = arr.filter((v, i, source) => {
			thirdArgs.push(source);
			arr = [9];
			return v % 2 === 0;
		});
		expect(evens.size()).to.equal(2);
		expect(thirdArgs.size()).to.equal(4);
		expect(thirdArgs[3]).to.equal(original);
	});

	it("should evaluate every's callback argument before iterating", () => {
		const arr = [1, 2, 3];
		function getPredicate() {
			arr.push(4);
			return (v: number) => v <= 4;
		}
		expect(arr.every(getPredicate())).to.equal(true);
		expect(arr.size()).to.equal(4);
	});

	it("should search the original array in find even if the callback reassigns the binding", () => {
		let arr = [1, 2, 3];
		const found = arr.find(v => {
			arr = [42];
			return v === 3;
		});
		expect(found).to.equal(3);
	});

	it("should evaluate insert operands in order", () => {
		const arr = [10, 30];
		let i = 0;
		const seen = new Array<number>();
		function value() {
			seen.push(i);
			return 20;
		}
		arr.insert((i += 1), value());
		expect(seen[0]).to.equal(1);
		expect(arr[1]).to.equal(20);
		expect(arr.size()).to.equal(3);
	});

	it("should evaluate remove's index argument before removing", () => {
		const arr = [10, 20, 30];
		function index() {
			arr.push(40);
			return 3;
		}
		// the argument is evaluated first, so index 3 refers to the array after the push
		expect(arr.remove(index())).to.equal(40);
		expect(arr.size()).to.equal(3);
	});

	// Luau can read a local at the operator instruction, after the right operand has changed it

	it("should read the left operand of a binary expression before the right side runs", () => {
		let a = 1;
		function f() {
			a = 5;
			return 2;
		}
		expect(a + f()).to.equal(3);
		expect(a).to.equal(5);
	});

	it("should read a compound assignment's target before its value expression runs", () => {
		let x = 2;
		function f() {
			x = 100;
			return 10;
		}
		x *= f();
		expect(x).to.equal(20);
	});

	it("should read the map for get before a key argument that rebinds it", () => {
		let map = new Map<string, number>([["k", 1]]);
		function key() {
			map = new Map<string, number>([["k", 2]]);
			return "k";
		}
		expect(map.get(key())).to.equal(1);
		expect(map.get("k")).to.equal(2);
	});

	it("should evaluate math macro operands left-to-right", () => {
		let v1 = new Vector2(1, 2);
		function swap() {
			const other = new Vector2(10, 20);
			v1 = new Vector2(0, 0);
			return other;
		}
		const sum = v1.add(swap());
		expect(sum.X).to.equal(11);
		expect(sum.Y).to.equal(22);
	});

	it("should join the original array even if the separator argument reassigns the binding", () => {
		let arr = ["a", "b"];
		function separator() {
			arr = ["z"];
			return "-";
		}
		expect(arr.join(separator())).to.equal("a-b");
	});

	it("should delete from the original map even if the key argument reassigns the binding", () => {
		let map = new Map<string, number>([["k", 1]]);
		const original = map;
		function key() {
			map = new Map<string, number>([["k", 2]]);
			return "k";
		}
		expect(map.delete(key())).to.equal(true);
		expect(original.has("k")).to.equal(false);
		expect(map.has("k")).to.equal(true);
	});

	it("should evaluate includes' argument before searching", () => {
		const arr = [1, 2];
		function value() {
			arr.push(99);
			return 99;
		}
		// the argument is evaluated before the search runs, so 99 is present
		expect(arr.includes(value())).to.equal(true);
	});

	it("should evaluate a conditional receiver expression exactly once", () => {
		const cond = math.floor(1.5) === 1;
		// the receiver must be evaluated to a single map — if the conditional were
		// re-evaluated for each internal use of the macro, the write would land on a
		// different allocation than the returned map
		const m = (cond ? new Map<number, number>([[1, 1]]) : new Map<number, number>([[2, 2]])).set(3, 3);
		expect(m.get(3)).to.equal(3);
		expect(m.get(1)).to.equal(1);
		expect(m.size()).to.equal(2);
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

	it("should order a pure recursive helper before a mutating macro argument", () => {
		function fib(n: number): number {
			return n < 2 ? n : fib(n - 1) + fib(n - 2);
		}
		const arr = [1, 2, 3];
		const values = [fib(4), arr.pop()!];
		expect(values[0]).to.equal(3);
		expect(values[1]).to.equal(3);
		expect(arr.size()).to.equal(2);
	});

	it("should read an outer binding before a helper that writes it", () => {
		let n = 0;
		function bumpN() {
			n += 5;
			return 1;
		}
		const arr = [10, 20];
		const values = [n, bumpN(), arr.pop()!];
		expect(values[0]).to.equal(0);
		expect(values[1]).to.equal(1);
		expect(values[2]).to.equal(20);
		expect(n).to.equal(5);
	});

	it("should read an outer binding before a helper that writes it (macro arguments)", () => {
		let n = 0;
		function bumpN() {
			n += 5;
			return 1;
		}
		const arr = [10, 20];
		const values = new Array<number>();
		// same ordering constraint, but through a macro's argument list
		values.push(n, bumpN(), arr.pop()!);
		expect(values[0]).to.equal(0);
		expect(values[1]).to.equal(1);
		expect(values[2]).to.equal(20);
		expect(n).to.equal(5);
	});

	it("should order a heap-writing helper between a heap read and a macro", () => {
		const state = { n: 1 };
		function bump() {
			state.n += 1;
			return state.n;
		}
		const arr = [10, 20];
		const values = [state.n, bump(), arr.pop()!];
		expect(values[0]).to.equal(1);
		expect(values[1]).to.equal(2);
		expect(values[2]).to.equal(20);
	});

	it("should push to the original array when the argument helper rebinds it", () => {
		let target = [1, 2, 3];
		const original = target;
		function rebind() {
			target = [9];
			return 99;
		}
		target.push(rebind());
		expect(original.size()).to.equal(4);
		expect(original[3]).to.equal(99);
		expect(target.size()).to.equal(1);
		expect(target[0]).to.equal(9);
	});

	it("should push to the original nested array when the argument reassigns the property", () => {
		const holder = { items: [1, 2, 3] };
		const original = holder.items;
		function swap() {
			holder.items = [9];
			return 99;
		}
		holder.items.push(swap());
		expect(original.size()).to.equal(4);
		expect(original[3]).to.equal(99);
		expect(holder.items.size()).to.equal(1);
		expect(holder.items[0]).to.equal(9);
	});

	it("should evaluate a helper returning a fresh array exactly once for a macro receiver", () => {
		let calls = 0;
		function make() {
			calls += 1;
			return [1, 2, 3];
		}
		expect(make().pop()).to.equal(3);
		expect(calls).to.equal(1);
	});

	it("should evaluate an effect-free helper receiver exactly once when the macro uses it twice", () => {
		function makeUnsorted() {
			return [3, 1, 2];
		}
		// sort mutates the receiver and returns it — if the effect-free call were re-evaluated
		// per use, the returned array would be a fresh, unsorted allocation
		const sorted = makeUnsorted().sort();
		expect(sorted[0]).to.equal(1);
		expect(sorted[1]).to.equal(2);
		expect(sorted[2]).to.equal(3);
	});

	it("should read an outer binding before an inline callback that writes it", () => {
		let n = 0;
		const arr = [1, 2, 3];
		// the inline callback's body is analyzed too — its write to `n` must keep the
		// earlier raw read of `n` ahead of the map loop
		const values: Array<defined> = [
			n,
			arr.map(v => {
				n += 1;
				return v;
			}),
		];
		expect(values[0]).to.equal(0);
		expect(n).to.equal(3);
	});

	it("should copy a spread before a later element expression mutates the source", () => {
		const arr = [1, 2];
		function addNine() {
			arr.push(9);
			return 3;
		}
		const result = [...arr, addNine()];
		expect(result.size()).to.equal(3);
		expect(result[0]).to.equal(1);
		expect(result[1]).to.equal(2);
		expect(result[2]).to.equal(3);
		expect(arr.size()).to.equal(3);
	});

	it("should evaluate a table read before an effect-free reduce", () => {
		const obj = { x: 5 };
		const arr = [1, 2, 3];
		const values = [obj.x, arr.reduce((a, b) => a + b, 0)];
		expect(values[0]).to.equal(5);
		expect(values[1]).to.equal(6);
	});

	it("should preserve datatype values beside collection mutations", () => {
		const arr = [1, 2, 3];
		const values = [
			new Vector3(4, 5, 6).X,
			new UDim(0.5, 12).Offset,
			new UDim2(new UDim(0.25, 1), new UDim(0.75, 2)).Y.Scale,
			arr.pop()!,
		];
		expect(values[0]).to.equal(4);
		expect(values[1]).to.equal(12);
		expect(values[2]).to.equal(0.75);
		expect(values[3]).to.equal(3);
		expect(arr.size()).to.equal(2);

		const other = [1, 2, 3];
		const sequenceValues = [new ColorSequence(new Color3(0.25, 0.5, 0.75)), other.pop()!] as const;
		expect(sequenceValues[0].Keypoints[0].Value.R).to.equal(0.25);
		expect(sequenceValues[1]).to.equal(3);
		expect(other.size()).to.equal(2);

		const constrained = [1, 2, 3];
		const keypoints = [
			new ColorSequenceKeypoint(0, new Color3(1, 0, 0)),
			new ColorSequenceKeypoint(1, new Color3(0, 0, 1)),
		];
		const constrainedValues = [new ColorSequence(keypoints), constrained.pop()!] as const;
		expect(constrainedValues[0].Keypoints.size()).to.equal(2);
		expect(constrainedValues[1]).to.equal(3);
		expect(constrained.size()).to.equal(2);

		const geometry = [1, 2, 3];
		const position = new Vector3(1, 2, 3);
		const min2 = new Vector2(0, 0);
		const max2 = new Vector2(4, 5);
		const min3 = new Vector3(0, 0, 0);
		const max3 = new Vector3(4, 5, 6);
		const min16 = new Vector3int16(0, 0, 0);
		const max16 = new Vector3int16(4, 5, 6);
		const geometryValues = [
			new CFrame(position).X,
			new Ray(position, max3).Origin.X,
			new Rect(min2, max2).Width,
			new Region3(min3, max3).Size.X,
			new Region3int16(min16, max16).Max.Z,
			new BrickColor(1, 0, 0).r,
			geometry.pop()!,
		];
		expect(geometryValues[0]).to.equal(1);
		expect(geometryValues[1]).to.equal(1);
		expect(geometryValues[2]).to.equal(4);
		expect(geometryValues[3]).to.equal(4);
		expect(geometryValues[4]).to.equal(6);
		expect(geometryValues[5] >= 0).to.equal(true);
		expect(geometryValues[6]).to.equal(3);
		expect(geometry.size()).to.equal(2);

		const numbers = [1, 2, 3];
		const numberSequenceValues = [new NumberSequence(1, 2), numbers.pop()!] as const;
		expect(numberSequenceValues[0].Keypoints[0].Value).to.equal(1);
		expect(numberSequenceValues[1]).to.equal(3);
		expect(numbers.size()).to.equal(2);

		const bounded = [1, 2, 3];
		const boundedValues = [
			new NumberRange(-1, 1).Max,
			new ColorSequenceKeypoint(0.5, new Color3(1, 0, 0)).Time,
			new NumberSequenceKeypoint(0.5, 2, 0.25).Value,
			new CFrame(0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1).X,
			bounded.pop()!,
		];
		expect(boundedValues[0]).to.equal(1);
		expect(boundedValues[1]).to.equal(0.5);
		expect(boundedValues[2]).to.equal(2);
		expect(boundedValues[3]).to.equal(0);
		expect(boundedValues[4]).to.equal(3);
		expect(bounded.size()).to.equal(2);
	});

	it("should map every element before the source binding is reassigned", () => {
		const double = (x: number) => x * 2;
		let arr = [1, 2, 3];
		const results = arr.map(double);
		expect(results[0]).to.equal(2);
		expect(results[2]).to.equal(6);
		// keep `arr` a live let-binding so the compiler cannot const-fold the receiver
		arr = [];
		expect(arr.size()).to.equal(0);
	});

	it("should analyze helpers containing loops, switch, and try/catch", () => {
		let log = "";
		function classify(n: number): string {
			let out = "";
			for (let i = 0; i < n; i++) {
				if (i === 2) continue;
				out += "i";
			}
			let j = n;
			while (j > 0) {
				j -= 1;
				if (j === 0) break;
			}
			do {
				out += "d";
			} while (false);
			switch (n) {
				case 3:
					out += "3";
					break;
				default:
					out += "?";
					break;
			}
			try {
				if (n > 100) throw "too big";
				out += "t";
			} catch (e) {
				log += tostring(e);
			} finally {
				out += "f";
			}
			return out;
		}
		const arr = [1, 2, 3];
		const values = [classify(3), arr.pop()!];
		expect(values[0]).to.equal("iid3tf");
		expect(values[1]).to.equal(3);
		expect(log).to.equal("");
	});

	it("should analyze helpers with destructured and defaulted parameters", () => {
		function sum([a, b]: [number, number], { c }: { c: number }, d = 4): number {
			return a + b + c + d;
		}
		const arr = [1, 2, 3];
		const values = [sum([1, 2], { c: 3 }), arr.pop()!];
		expect(values[0]).to.equal(10);
		expect(values[1]).to.equal(3);
	});

	it("should analyze helpers that build tables with spreads and computed keys", () => {
		const base = [1, 2];
		const key = "k";
		function build(): number {
			const copy = [...base, 3];
			const obj: { [index: string]: number } = { [key]: copy.size() };
			const merged: { [index: string]: number } = { x: 1, ...obj };
			return merged.k! + merged.x!;
		}
		const arr = [1, 2, 3];
		const values = [build(), arr.pop()!];
		expect(values[0]).to.equal(4);
		expect(values[1]).to.equal(3);
	});

	it("should analyze computed object-method names", () => {
		let value = 0;
		function key() {
			value = 1;
			return "method";
		}
		function makeObject() {
			return {
				[key()]() {},
			};
		}
		const seen = new Array<defined>();
		function observe(object: object, mapped: number) {
			seen.push(object);
			seen.push(mapped);
		}
		observe(makeObject(), [0].map(() => value)[0]);
		expect(seen[1]).to.equal(1);
	});

	it("should preserve reads before a generator changes their binding", () => {
		let n = 0;
		function* gen() {
			n += 1;
			yield n;
		}
		function drain(): number {
			let total = 0;
			for (const v of gen()) {
				total += v;
			}
			return total;
		}
		const arr = [1, 2, 3];
		// drain iterates a generator (user code) — the read of `n` must stay ahead of it
		const values = [n, drain(), arr.pop()!];
		expect(values[0]).to.equal(0);
		expect(values[1]).to.equal(1);
		expect(values[2]).to.equal(3);
		expect(n).to.equal(1);
	});

	it("should analyze mutually recursive helpers", () => {
		function isEven(n: number): boolean {
			return n === 0 ? true : isOdd(n - 1);
		}
		function isOdd(n: number): boolean {
			return n === 0 ? false : isEven(n - 1);
		}
		const arr = [1, 2, 3];
		const values = [isEven(4), arr.pop()!];
		expect(values[0]).to.equal(true);
		expect(values[1]).to.equal(3);
	});

	it("should treat construction and methods of user classes as unknown code", () => {
		let constructed = 0;
		class Counter {
			public value = 0;
			constructor() {
				constructed += 1;
			}
			public bump(): number {
				this.value += 1;
				return this.value;
			}
		}
		function make(): number {
			const c = new Counter();
			return c.bump();
		}
		const arr = [1, 2, 3];
		// make() constructs and calls methods — unknown code, ordered ahead of pop
		const values = [constructed, make(), arr.pop()!];
		expect(values[0]).to.equal(0);
		expect(values[1]).to.equal(1);
		expect(values[2]).to.equal(3);
		expect(constructed).to.equal(1);
	});

	it("should analyze helpers using typeOf, typeIs, and assert macros", () => {
		function describe(value: unknown): string {
			assert(value !== undefined);
			if (typeIs(value, "number")) {
				return `n${value}`;
			}
			return typeOf(value);
		}
		const arr = [1, 2, 3];
		const values = [describe(5), describe("x"), arr.pop()!];
		expect(values[0]).to.equal("n5");
		expect(values[1]).to.equal("string");
		expect(values[2]).to.equal(3);
	});

	it("should analyze helpers with compound member updates", () => {
		const state = { n: 1, m: 2 };
		const keys = ["n", "m"] as const;
		function bumpAll(): number {
			state.n += 10;
			state[keys[1]] *= 2;
			state.n++;
			return state.n + state.m;
		}
		const arr = [1, 2, 3];
		// bumpAll writes the table `state` reads from — the earlier read stays ahead
		const values = [state.n, bumpAll(), arr.pop()!];
		expect(values[0]).to.equal(1);
		expect(values[1]).to.equal(16);
		expect(values[2]).to.equal(3);
	});

	it("should summarize template literals by their interpolated types", () => {
		const obj = { n: 5 };
		function primitiveTemplate(x: number): string {
			return `v=${x}`;
		}
		function objectTemplate(): string {
			return `${obj.n}`;
		}
		const arr = [1, 2, 3];
		const values = [primitiveTemplate(1), objectTemplate(), arr.pop()!];
		expect(values[0]).to.equal("v=1");
		expect(values[1]).to.equal("5");
		expect(values[2]).to.equal(3);
	});

	it("should preserve engine call results across table mutations", () => {
		const arr = [1, 2, 3];
		function bothDefined(a: unknown, b: unknown): boolean {
			return a !== undefined && b !== undefined;
		}
		function findWorkspace() {
			return game.FindFirstChild("Workspace");
		}
		expect(bothDefined(findWorkspace(), arr.pop())).to.equal(true);
		expect(bothDefined(game.GetChildren(), arr.pop())).to.equal(true);
		expect(arr.size()).to.equal(1);
	});

	it("should order instance property reads against table mutations", () => {
		const workspace = game.GetService("Workspace");
		const arr = [1, 2, 3];
		// an instance property read may throw and pop's frozen-table write may throw, so
		// error interleaving forces the read ahead of pop's statements
		const values = [workspace.Name, tostring(arr.pop())];
		expect(values[0]).to.equal("Workspace");
		expect(values[1]).to.equal("3");
	});

	it("should evaluate an expression-position compound assignment in TS order", () => {
		let x = 2;
		function f(): number {
			x = 100;
			return 10;
		}
		const y = (x *= f());
		expect(y).to.equal(20);
		expect(x).to.equal(20);
	});

	it("should order two helpers that write the same binding", () => {
		let n = 0;
		function first(): string {
			n = 1;
			return "a";
		}
		function second(): string {
			n = 2;
			return "b";
		}
		const arr = [1, 2, 3];
		// both helpers write `n` — their relative order (and their order against pop) is fixed
		const values = [first(), second(), arr.pop()!];
		expect(values[0]).to.equal("a");
		expect(values[1]).to.equal("b");
		expect(values[2]).to.equal(3);
		expect(n).to.equal(2);
	});

	it("should evaluate findIndex's callback against the original array", () => {
		let arr = [10, 20, 30];
		const index = arr.findIndex(v => v === 20);
		expect(index).to.equal(1);
		expect(arr.findIndex(v => v === 99)).to.equal(-1);
		// keep `arr` a live let-binding so the receiver is not const-folded
		arr = [];
		expect(arr.findIndex(v => v === 1)).to.equal(-1);
	});

	it("should evaluate a tuple spread into a macro before later effects", () => {
		const arr = [10, 20, 30];
		let n = 0;
		function pair(): [number, number] {
			n += 1;
			return [1, 99];
		}
		// the spread unpacks into temporaries as part of its operand's prereqs, ordered
		// against everything after it
		arr.insert(...pair());
		expect(arr[0]).to.equal(10);
		expect(arr[1]).to.equal(99);
		expect(arr.size()).to.equal(4);
		expect(n).to.equal(1);
	});

	it("should unpack tuple spreads after explicit macro arguments", () => {
		const arr = [10];
		const value: [number] = [99];
		arr.insert(0, ...value);
		expect(arr[0]).to.equal(99);
		expect(arr[1]).to.equal(10);
	});

	it("should treat calls through mutable function bindings as unknown code", () => {
		let impl = (): number => 5;
		function callImpl(): number {
			return impl();
		}
		const arr = [1, 2, 3];
		// `impl` is a let binding, so callImpl's body cannot be summarized precisely — its
		// call must stay ordered ahead of pop's mutation
		const values = [callImpl(), arr.pop()!];
		expect(values[0]).to.equal(5);
		expect(values[1]).to.equal(3);
		impl = () => 6;
		expect(callImpl()).to.equal(6);
	});

	it("should analyze helpers that iterate $range", () => {
		function total(): number {
			let t = 0;
			for (const i of $range(1, 4)) {
				t += i;
			}
			return t;
		}
		const arr = [1, 2, 3];
		const values = [total(), arr.pop()!];
		expect(values[0]).to.equal(10);
		expect(values[1]).to.equal(3);
	});

	it("should evaluate set-literal members in order around macros", () => {
		const order = new Array<string>();
		function a(): string {
			order.push("a");
			return "a";
		}
		function b(): string {
			order.push("b");
			return "b";
		}
		const arr = [1, 2, 3];
		const set = new Set([a(), b()]);
		expect(set.has("a")).to.equal(true);
		expect(set.has("b")).to.equal(true);
		expect(arr.pop()).to.equal(3);
		expect(order[0]).to.equal("a");
		expect(order[1]).to.equal("b");
	});

	// inspecting only the residual RHS misses writes in its prerequisite statements
	it("should read a compound assignment target before the value's prereq statements", () => {
		let n = 0;
		function bump(): number {
			n += 1;
			return 4;
		}
		function digits(): number {
			return `${n}`.size();
		}
		// the ternary lowers to an if-statement; its else branch runs bump(), which writes n
		n += n > 4 ? digits() : n + bump();
		expect(n).to.equal(4);
	});

	it("should read a compound assignment target before macro-lowered prereqs", () => {
		let n = 0;
		const arr = [1, 2, 3];
		function bump(): number {
			n += 1;
			return 4;
		}
		// arr.pop() forces the ternary to lower to statements, and bump() runs inside them
		n += (arr.pop() ?? 0) > 99 ? 1 : n + bump();
		expect(n).to.equal(4);
		expect(arr.size()).to.equal(2);
	});

	it("should read a compound assignment target before a value that reassigns it", () => {
		let m = 0;
		m += m = 2;
		expect(m).to.equal(2);
	});

	it("should read a compound assignment target before prereqs in expression position", () => {
		let n = 0;
		function bump(): number {
			n += 1;
			return 4;
		}
		function digits(): number {
			return `${n}`.size();
		}
		const result = (n += n > 4 ? digits() : n + bump());
		expect(result).to.equal(4);
		expect(n).to.equal(4);
	});

	it("should read a compound assignment property target before the value's prereqs", () => {
		const obj = { a: 0 };
		const arr = [1, 2, 3];
		function bump(): number {
			obj.a += 1;
			return 4;
		}
		// the popping branch forces statement lowering, and bump() writes obj.a inside it
		obj.a += obj.a > 99 ? 1 : (arr.pop() ?? 0) + bump();
		expect(obj.a).to.equal(7);
		expect(arr.size()).to.equal(2);
	});
};
