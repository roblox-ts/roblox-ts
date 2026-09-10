export = () => {
	it("should preserve array behavior through inherited interfaces and generic constraints", () => {
		interface Values extends ReadonlyArray<number> {}
		interface Left extends Values {}
		interface Right extends Values {}
		interface Combined extends Left, Right {}
		interface Derived extends Combined {}

		function sum<T extends Derived>(values: T) {
			let total = 0;
			for (const value of values) {
				total += value;
			}
			return total;
		}

		function first(values: Derived | undefined) {
			return values?.[0];
		}

		const values: Derived = [2, 3, 5];
		expect(sum(values)).to.equal(10);
		expect(first(values)).to.equal(2);
		expect(first(undefined)).to.equal(undefined);
		expect([...values][2]).to.equal(5);
	});

	it("should preserve numeric keys when indexing object types", () => {
		function read(values: { [index: number]: number }, index: number) {
			return values[index];
		}

		const values = { 0: 2, 1: 3, 2: 5 };
		expect(read(values, 0)).to.equal(2);
		expect(read(values, 1)).to.equal(3);
		expect(read(values, 2)).to.equal(5);
	});

	it("should properly fetch types with parenthesis and nonNull assertions", () => {
		function loop(array?: Array<number>) {
			let i = 0;
			// prettier-ignore
			for (const value of ((array)!)!) expect(value).to.equal(i++);
		}

		loop([0, 1, 2, 3]);
	});
	it("should support instantiated expressions", () => {
		function wow<T extends string>(str: T) {
			return str;
		}
		const foo = wow<"foo">;
		expect(foo("foo")).to.equal("foo");
	});
};
