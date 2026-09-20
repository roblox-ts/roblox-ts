export = () => {
	it("should preserve stored tuples and missing map entries", () => {
		const tuple = [1, "one"] as LuaTuple<[number, string]>;
		const values = new Map<string, LuaTuple<[number, string]>>([["present", tuple]]);
		const present = values.get("present");
		const missing = values.get("missing");
		expect(present).to.equal(tuple);
		expect(missing).to.equal(undefined);
		expect(values.get("present")?.[1]).to.equal("one");
		expect(values.get("missing")?.[1]).to.equal(undefined);

		const readonlyValues: ReadonlyMap<string, LuaTuple<[number, string]>> = values;
		expect(readonlyValues.get("present")).to.equal(tuple);
		expect(readonlyValues.get("missing")).to.equal(undefined);
		function checkOptional(map: typeof values | undefined, expected: typeof tuple | undefined) {
			const result = map?.get("present");
			expect(result).to.equal(expected);
		}
		checkOptional(values, tuple);
		checkOptional(undefined, undefined);
	});

	it("should preserve stored tuples through pop and find", () => {
		const tuple = [2, "two"] as LuaTuple<[number, string]>;
		const values = [tuple];
		expect(values.find(() => true)).to.equal(tuple);
		expect(values.find(() => false)).to.equal(undefined);
		expect(values.pop()).to.equal(tuple);
		expect(values.pop()).to.equal(undefined);
		expect(values.find(() => true)).to.equal(undefined);
		expect(identity(tuple)).to.equal(tuple);
	});

	it("should preserve stored tuples returned by table removal calls", () => {
		const tuple = [3, "three"] as LuaTuple<[number, string]>;
		const values = [tuple, tuple, tuple, tuple];
		expect(values.shift()).to.equal(tuple);
		expect(values.remove(0)).to.equal(tuple);
		expect(values.shift()![1]).to.equal("three");
		const [first, second] = values.remove(0)!;
		expect(first).to.equal(3);
		expect(second).to.equal("three");
		expect(values.shift()).to.equal(undefined);
		expect(values.remove(0)).to.equal(undefined);

		values.push(tuple, tuple);
		let assignedFirst = 0;
		let assignedSecond = "";
		[assignedFirst, assignedSecond] = values.shift()!;
		expect(assignedFirst).to.equal(3);
		expect(assignedSecond).to.equal("three");
		function take(): LuaTuple<[number, string]> {
			return values.remove(0)!;
		}
		const [returnedFirst, returnedSecond] = take();
		expect(returnedFirst).to.equal(3);
		expect(returnedSecond).to.equal("three");
	});

	it("should capture stored tuples before effectful indices without boxing again", () => {
		const tuple = [4, "four"] as LuaTuple<[number, string]>;
		const values = new Map<string, LuaTuple<[number, string]>>([["present", tuple]]);
		let calls = 0;
		function index() {
			calls++;
			values.delete("present");
			return 1 as const;
		}
		expect(values.get("present")![index()]).to.equal("four");
		expect(calls).to.equal(1);
	});

	it("should retain tuple accumulators between reducer callbacks", () => {
		const singleton = [7] as LuaTuple<[number]>;
		const singletonResult = [0].reduce(() => singleton, singleton);
		expect(singletonResult[0]).to.equal(7);

		const initial = [0, "initial"] as LuaTuple<[number, string]>;
		const result = [1, 2].reduce((previous, value) => {
			return $tuple(previous[0] + value, `${previous[1]}:${value}`);
		}, initial);
		expect(result[0]).to.equal(3);
		expect(result[1]).to.equal("initial:1:2");

		const withoutInitial = [initial, initial].reduce(previous => {
			return $tuple(previous[0] + 1, "reduced");
		});
		expect(withoutInitial[0]).to.equal(1);
		expect(withoutInitial[1]).to.equal("reduced");
	});

	it("should preserve untouched tuple accumulators and forward reduced tuples", () => {
		const tuple = [5, "five"] as LuaTuple<[number, string]>;
		expect(new Array<number>().reduce(() => tuple, tuple)).to.equal(tuple);
		expect([tuple].reduce(() => tuple)).to.equal(tuple);

		function reduce() {
			return [0].reduce(() => tuple, tuple);
		}
		const [first, second] = reduce();
		expect(first).to.equal(5);
		expect(second).to.equal("five");
	});

	it("should retain multiple return values from string macros", () => {
		const result = "abc".find("b");
		expect(result[0]).to.equal(2);
		expect(result[1]).to.equal(2);
		const [first, last] = "abc".find("b");
		expect(first).to.equal(2);
		expect(last).to.equal(2);
		expect("abc".find("b")[1]).to.equal(2);
		function find() {
			return "abc".find("b");
		}
		const [returnedFirst, returnedLast] = find();
		expect(returnedFirst).to.equal(2);
		expect(returnedLast).to.equal(2);
	});
};
