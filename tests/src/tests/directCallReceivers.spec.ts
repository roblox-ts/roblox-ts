export = () => {
	it("should supply an undefined receiver to direct receiver calls", () => {
		function callback(this: defined | void, value: number) {
			expect(this).to.equal(undefined);
			return value + 1;
		}

		expect(callback(41)).to.equal(42);
		const optional: typeof callback | undefined = (() => callback)();
		expect(optional?.(41)).to.equal(42);

		const adapted: (this: void, value: number) => number = value => callback(value);
		expect(adapted(41)).to.equal(42);
	});

	it("should preserve receiver slots and evaluation order with spread arguments", () => {
		const order = new Array<string>();
		function callback(this: defined | void, ...values: Array<number>) {
			expect(this).to.equal(undefined);
			return values[0] + values[1];
		}
		function getCallback() {
			order.push("callee");
			return callback;
		}
		function getValues(): LuaTuple<[number, number]> {
			order.push("arguments");
			return $tuple(20, 22);
		}

		expect(getCallback()(...getValues())).to.equal(42);
		expect(order.join(",")).to.equal("callee,arguments");

		const absent = ((): typeof callback | undefined => undefined)();
		expect(absent?.(...getValues())).to.equal(undefined);
		expect(order.join(",")).to.equal("callee,arguments");
	});
};
