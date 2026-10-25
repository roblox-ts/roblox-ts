export = () => {
	it("should compare allocated case values by identity and preserve operand order", () => {
		const events = new Array<string>();
		function value() {
			events.push("value");
			return 1;
		}
		function key() {
			events.push("key");
			return "key";
		}
		function classify(input: unknown) {
			switch (input) {
				case () => 1:
				case [1]:
				case [value()]:
				case new Set([1]):
				case new Set([value()]):
				case { key: 1 }:
				case { [key()]: 1 }:
				case { key: value() }:
				case -1:
				case -value():
					return "matched";
				default:
					return "different";
			}
		}

		expect(classify({ key: 1 })).to.equal("different");
		expect(events.join(",")).to.equal("value,value,key,value,value");
	});

	it("should evaluate conditional case values against the original discriminant", () => {
		let mutable = 1;
		function classify(input: number) {
			switch (input) {
				case true ? 0 : 1:
					return "zero";
				case true ? mutable : 0:
					return "first";
				case false ? 0 : mutable + 1:
					return "second";
				// prettier-ignore
				case (mutable + 2):
					mutable = 10;
					return "third";
				default:
					return "missing";
			}
		}

		expect(classify(0)).to.equal("zero");
		expect(classify(1)).to.equal("first");
		expect(classify(2)).to.equal("second");
		expect(classify(3)).to.equal("third");
		expect(mutable).to.equal(10);
	});

	it("should support switch statements with fall through", () => {
		function foo(s: string) {
			switch (s) {
				case "a":
				case "b":
					return 1;
				case "c":
					return 2;
				case "d":
					if (true) {
						break;
					}
				case "e": {
					return 4;
				}
				default:
					return -1;
			}
			return 3;
		}

		expect(foo("a")).to.equal(1);
		expect(foo("b")).to.equal(1);
		expect(foo("c")).to.equal(2);
		expect(foo("d")).to.equal(3);
		expect(foo("e")).to.equal(4);
		expect(foo("f")).to.equal(-1);
	});

	it("should support switch statements without fall through", () => {
		function bar(s: string) {
			switch (s) {
				case "a":
					return 1;
				case "b":
					return 2;
				case "c":
					return 3;
			}
			return 4;
		}

		expect(bar("a")).to.equal(1);
		expect(bar("b")).to.equal(2);
		expect(bar("c")).to.equal(3);
		expect(bar("d")).to.equal(4);
	});

	it("should evaluate each case expression once", () => {
		let evaluations = 0;
		function getCase(value: number) {
			evaluations++;
			return value;
		}

		switch (3) {
			case getCase(1):
			case getCase(2):
			case getCase(3):
				break;
			case getCase(4):
				break;
		}

		expect(evaluations).to.equal(3);
	});

	it("should evaluate the switch expression only once", () => {
		let a = 1;
		let matchedAfterMutation = false;

		function increaseA() {
			a++;
			return 0;
		}

		switch (a) {
			case increaseA():
				break;
			case 2:
				matchedAfterMutation = true;
				break;
		}

		expect(matchedAfterMutation).to.equal(false);
	});

	it("should retain the original parameter when case expressions assign to it", () => {
		function assign(value: number) {
			switch (value) {
				case (value = 2):
					return "two";
				default:
					return "original";
			}
		}

		function call(value: number) {
			function change() {
				value = 2;
				return 0;
			}

			switch (value) {
				case change():
					return "zero";
				case 2:
					return "two";
				default:
					return "original";
			}
		}

		expect(assign(1)).to.equal("original");
		expect(assign(2)).to.equal("two");
		expect(call(1)).to.equal("original");
		expect(call(2)).to.equal("two");
	});

	it("should preserve fallthrough after reassigning a literal switch operand", () => {
		function classify(value: string) {
			const events = new Array<string>();
			switch (value) {
				case "a":
					events.push("a");
					value = "changed";
				case "b":
					events.push("b");
				case "c":
					events.push("c");
					break;
				default:
					events.push("default");
			}

			return `${events.join(",")}:${value}`;
		}

		expect(classify("a")).to.equal("a,b,c:changed");
		expect(classify("b")).to.equal("b,c:b");
		expect(classify("c")).to.equal("c:c");
		expect(classify("missing")).to.equal("default:missing");
	});

	it("should preserve the operand when a shared case declaration shadows it", () => {
		function classify(value: string) {
			switch (value) {
				case "a":
					let value: string | undefined = "inner";
				case "b":
					return value;
				default:
					return "missing";
			}
		}

		expect(classify("a")).to.equal("inner");
		expect(classify("missing")).to.equal("missing");
	});

	it("should support switch statements with remaining empty conditions", () => {
		function bar(s: string) {
			switch (s) {
				case "a":
					return 1;
				case "b":
				case "c":
			}
			return 2;
		}

		expect(bar("a")).to.equal(1);
		expect(bar("b")).to.equal(2);
		expect(bar("c")).to.equal(2);
		expect(bar("d")).to.equal(2);
	});

	it("should support switch statements with context", () => {
		function bar(n: number) {
			let x = 1;
			switch (n) {
				case x++:
					return -1;
				case x++:
					return -2;
			}
			return 0;
		}

		expect(bar(1)).to.equal(-1);
		expect(bar(2)).to.equal(-2);
		expect(bar(3)).to.equal(0);
	});

	it("should support switch statements with fallthrough and context", () => {
		function bar(n: number) {
			let x = 1;
			switch (n) {
				case x++:
				case x++:
					return -2;
			}
			return 0;
		}

		expect(bar(1)).to.equal(-2);
		expect(bar(2)).to.equal(-2);
		expect(bar(3)).to.equal(0);
	});

	it("should support switch statements with preceding statements", () => {
		function bar(n: number) {
			let x = 1;
			switch (++n) {
				case x++:
				case x++:
				case x++:
				case x++:
					return -2;
			}
			return 0;
		}

		expect(bar(0)).to.equal(-2);
		expect(bar(1)).to.equal(-2);
		expect(bar(2)).to.equal(-2);
		expect(bar(3)).to.equal(-2);
		expect(bar(4)).to.equal(0);
	});

	it("should support switch statements with a boolean value", () => {
		function foo(n: number) {
			switch (true) {
				case n >= 10:
					return 10;
				case n >= 5:
					return 5;
				case n >= 0:
					return 0;
			}
		}

		expect(foo(10)).to.equal(10);
		expect(foo(7)).to.equal(5);
		expect(foo(5)).to.equal(5);
		expect(foo(3)).to.equal(0);
		expect(foo(0)).to.equal(0);
	});

	it("should continue the enclosing loop from inside a switch", () => {
		const visited = new Array<string>();

		for (const value of [1, 2, 3]) {
			switch (value) {
				case 2:
					visited.push("skipped");
					continue;
			}

			visited.push(`after ${value}`);
		}

		expect(visited.join(",")).to.equal("after 1,skipped,after 3");
	});

	it("should re-evaluate the loop condition when continuing from inside a switch", () => {
		const visited = new Array<number>();
		let count = 0;

		while (count < 3) {
			count += 1;

			switch (count) {
				case 2:
					continue;
			}

			visited.push(count);
		}

		expect(visited.join(",")).to.equal("1,3");
	});

	it("should continue the enclosing loop from inside nested switch statements", () => {
		const visited = new Array<string>();

		for (const value of [1, 2]) {
			switch (value) {
				case 2:
					switch (value) {
						case 2:
							visited.push("inner");
							continue;
					}

					visited.push("outer");
			}

			visited.push(`after ${value}`);
		}

		expect(visited.join(",")).to.equal("after 1,inner");
	});

	it("should continue the inner loop from a loop inside a case", () => {
		const visited = new Array<string>();

		for (const outer of [1, 2]) {
			switch (outer) {
				case 1:
					for (const inner of [1, 2, 3]) {
						if (inner === 2) {
							continue;
						}

						visited.push(`inner ${inner}`);
					}

					break;
			}

			visited.push(`outer ${outer}`);
		}

		expect(visited.join(",")).to.equal("inner 1,inner 3,outer 1,outer 2");
	});

	it("should write back the loop variable when continuing from inside a switch", () => {
		const visited = new Array<number>();

		// writing the loop variable in the body forces the unoptimized loop form,
		// which copies the variable back at the end of every iteration
		let guard = 0;
		for (let i = 0; i < 6; i++) {
			// a dropped write back turns the continue below into an infinite loop
			guard += 1;
			if (guard > 20) {
				break;
			}

			switch (i) {
				case 1:
					continue;
				case 3:
					i += 1;
					break;
			}

			visited.push(i);
		}

		expect(visited.join(",")).to.equal("0,2,4,5");

		// case 3 skips an iteration, so the body runs for 0, 1, 2, 3, and 5
		expect(guard).to.equal(5);
	});

	it("should continue a do-while loop from inside a switch", () => {
		const visited = new Array<number>();
		let count = 0;

		do {
			count += 1;

			switch (count) {
				case 2:
					continue;
			}

			visited.push(count);
		} while (count < 3);

		expect(visited.join(",")).to.equal("1,3");
	});

	it("should continue the enclosing loop alongside switch fallthrough and break", () => {
		const visited = new Array<string>();

		for (const value of [1, 2, 3, 4]) {
			switch (value) {
				case 1:
				case 2:
					if (value === 2) {
						continue;
					}

					visited.push("one or two");
					break;
				case 3:
					break;
				default:
					visited.push("default");
			}

			visited.push(`after ${value}`);
		}

		expect(visited.join(",")).to.equal("one or two,after 1,after 3,default,after 4");
	});
};
