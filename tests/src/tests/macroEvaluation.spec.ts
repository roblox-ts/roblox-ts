/// <reference types="@rbxts/testez/globals" />

export = () => {
	it("should create a predicate once even when the collection is empty", () => {
		let created = 0;
		let invoked = 0;
		function predicate() {
			created++;
			return () => {
				invoked++;
				return true;
			};
		}
		expect(new Array<number>().some(predicate())).to.equal(false);
		expect(created).to.equal(1);
		expect(invoked).to.equal(0);
	});

	it("should share a freshly created callback across every mapped element", () => {
		function counter() {
			let count = 0;
			return () => ++count;
		}
		const values = [10, 20, 30].map(counter());
		expect(values[0]).to.equal(1);
		expect(values[1]).to.equal(2);
		expect(values[2]).to.equal(3);
	});

	it("should evaluate each argument occurrence once and in order", () => {
		let calls = 0;
		const values = new Array<number>();
		function value() {
			expect(values.size()).to.equal(0);
			return ++calls;
		}
		values.push(value(), value());
		expect(calls).to.equal(2);
		expect(values[0]).to.equal(1);
		expect(values[1]).to.equal(2);
	});

	it("should evaluate an assertion message before testing its condition", () => {
		let calls = 0;
		function message() {
			calls++;
			return "expected failure";
		}
		const [success, reason] = pcall(() => assert(false, message()));
		expect(success).to.equal(false);
		expect(tostring(reason).find("expected failure")[0]).never.to.equal(undefined);
		expect(calls).to.equal(1);
	});

	it("should evaluate an empty tuple spread exactly once", () => {
		const array = new Array<number>();
		let calls = 0;
		function empty(): [] {
			calls++;
			array.push(1);
			return [];
		}
		expect(array.size(...empty())).to.equal(1);
		expect(calls).to.equal(1);
	});

	it("should preserve bracket macro calls and builtin math lookups", () => {
		const array = new Array<number>();
		array["push"](3);
		expect(array[0]).to.equal(3);
		expect(math["floor"](1.5)).to.equal(1);
		function round(mode: "floor" | "ceil") {
			return math[mode](1.5);
		}
		expect(round("floor")).to.equal(1);
		expect(round("ceil")).to.equal(2);
	});

	it("should keep clamp errors before later argument prerequisites", () => {
		let visited = false;
		const [success] = pcall(() => [
			math.clamp(0, 2, 1),
			[1].map(() => {
				visited = true;
				return 2;
			})[0],
		]);
		expect(success).to.equal(false);
		expect(visited).to.equal(false);
	});

	it("should preserve a computed callee's receiver before evaluating its key", () => {
		let callbacks = [() => 1];
		function index() {
			callbacks = [() => 2];
			return 0;
		}
		expect(callbacks[index()]()).to.equal(1);
		expect(callbacks[0]()).to.equal(2);
	});

	it("should preserve a complex computed callee before key prerequisites", () => {
		const holder = { callbacks: [() => 1] };
		const result =
			holder.callbacks[
				[0].map(() => {
					holder.callbacks = [() => 2];
					return 0;
				})[0]
			]();
		expect(result).to.equal(1);
		expect(holder.callbacks[0]()).to.equal(2);
	});

	it("should preserve a callee before argument prerequisites reassign it", () => {
		let callback = (value: number) => value;
		const result = callback(
			[1].map(() => {
				callback = () => 9;
				return 3;
			})[0],
		);
		expect(result).to.equal(3);
		expect(callback(0)).to.equal(9);
	});

	it("should preserve a computed read's receiver before evaluating its key", () => {
		let array = [1];
		function index() {
			array = [2];
			return 0;
		}
		expect(array[index()]).to.equal(1);
		expect(array[0]).to.equal(2);
	});

	it("should preserve a tuple result before index prerequisites", () => {
		let count = 0;
		function values(): LuaTuple<[number, number]> {
			count++;
			return $tuple(count, count);
		}
		const result =
			values()[
				[1].map(() => {
					count += 100;
					return 0;
				})[0]
			];
		expect(result).to.equal(1);
		expect(count).to.equal(101);
	});

	it("should preserve a string assignment key before the value reassigns it", () => {
		const object: { [key: string]: number } = {};
		let key = "before";
		function update() {
			key = "after";
			return 1;
		}
		object[key] = update();
		expect(object.before).to.equal(1);
		expect(object.after).to.equal(undefined);
	});

	it("should retain generator-expression effects when used inside a macro callback", () => {
		let count = 0;
		const generator = function* () {
			count++;
			yield count;
		};
		const values = [1, 2].map(() => {
			let value = 0;
			for (const yielded of generator()) {
				value = yielded;
			}
			return value;
		});
		expect(values[0]).to.equal(1);
		expect(values[1]).to.equal(2);
		expect(count).to.equal(2);
	});

	it("should preserve distinct loop bindings captured by macro callbacks", () => {
		const callbacks = new Array<() => number>();
		for (let value = 0; value < 4; value += 2) {
			callbacks.push(() => value);
			value++;
		}
		expect(callbacks[0]()).to.equal(1);
		expect(callbacks[1]()).to.equal(4);
	});

	it("should not move an empty math.min call past later argument effects", () => {
		let changed = false;
		const [success] = pcall(() => {
			const array = [
				math.min(),
				[0].map(() => {
					changed = true;
					return 1;
				})[0],
			];
			return array;
		});
		expect(success).to.equal(false);
		expect(changed).to.equal(false);
	});

	it("should evaluate a complex assignment base before an inline RHS", () => {
		const original = { value: 0 };
		const holder = { target: original };
		const change = () => {
			holder.target = { value: 99 };
			return 3;
		};
		holder.target.value = change();
		expect(original.value).to.equal(3);
		expect(holder.target.value).to.equal(99);
	});

	it("should capture a complex assignment base before hoisted RHS prerequisites", () => {
		const original = { value: 0 };
		const holder = { target: original };
		holder.target.value = [0].map(() => {
			holder.target = { value: 99 };
			return 3;
		})[0];
		expect(original.value).to.equal(3);
		expect(holder.target.value).to.equal(99);
	});

	it("should keep a native method receiver before an argument rebinds it", () => {
		let part = new Instance("Part");
		const original = part;
		part.SetAttribute(
			"value",
			[0].map(() => {
				part = new Instance("Part");
				return 7;
			})[0],
		);
		expect(original.GetAttribute("value")).to.equal(7);
		expect(part.GetAttribute("value")).to.equal(undefined);
		original.Destroy();
		part.Destroy();
	});

	it("should not trust builtin-looking methods on user tables", () => {
		const library = { floor: (n: number) => n };
		const value = library.floor(
			[0].map(() => {
				library.floor = () => 99;
				return 2;
			})[0],
		);
		expect(value).to.equal(2);
	});

	it("should guard optional native calls and keep the original receiver across argument effects", () => {
		let calls = 0;
		function apply(part: Part | undefined) {
			part?.SetAttribute(
				"value",
				[0].map(() => {
					part = undefined;
					calls += 1;
					return 7;
				})[0],
			);
			return part;
		}
		const original = new Instance("Part");
		expect(apply(original)).to.equal(undefined);
		expect(original.GetAttribute("value")).to.equal(7);
		expect(calls).to.equal(1);
		apply(undefined);
		expect(calls).to.equal(1);
		original.Destroy();
	});

	it("should capture replaceable methods on optional user-table receivers", () => {
		function apply(object: { SetAttribute(name: string, value: number): number } | undefined) {
			return object?.SetAttribute(
				"value",
				[0].map(() => {
					object!.SetAttribute = () => 99;
					return 7;
				})[0],
			);
		}
		expect(
			apply({
				SetAttribute(name, value) {
					return value;
				},
			}),
		).to.equal(7);
		expect(apply(undefined)).to.equal(undefined);
	});

	it("should evaluate a table.find receiver before arguments replace its source property", () => {
		const holder = { values: [1] };
		const change = () => {
			holder.values = [2];
			return 1;
		};
		expect(holder.values.includes(change())).to.equal(true);
		expect(holder.values[0]).to.equal(2);
	});

	it("should preserve explicit writes to a binding that closures only read", () => {
		let value = 1;
		const read = () => value;
		const result = value + (value = 2);
		expect(result).to.equal(3);
		expect(read()).to.equal(2);
	});

	it("should keep calls that observe a read-only capture before later explicit writes", () => {
		let value = 1;
		const read = () => value;
		function invoke(callback: () => number) {
			return callback();
		}
		const result = invoke(read) + (value = 2);
		expect(result).to.equal(3);
		expect(read()).to.equal(2);
	});

	it("should recognize destructuring writes through closures", () => {
		let value = 1;
		const change = () => {
			({ value } = { value: 9 });
			return 2;
		};
		const result = value + change();
		expect(result).to.equal(3);
		expect(value).to.equal(9);
	});

	it("should recognize for-of writes through closures", () => {
		let value = 1;
		const change = () => {
			for (value of [9]) {
				/* assignment is in the loop header */
			}
			return 2;
		};
		const result = value + change();
		expect(result).to.equal(3);
		expect(value).to.equal(9);
	});
	it("should evaluate length metamethods before starting a multi-argument push", () => {
		const output = new Array<number>();
		const input = setmetatable(new Array<number>(), { __len: () => output.size() });
		output.push(input.size(), input.size());
		expect(output[0]).to.equal(0);
		expect(output[1]).to.equal(0);
	});

	it("should evaluate equality metamethods before starting a multi-argument push", () => {
		const output = new Array<boolean>();
		const meta = { __eq: () => output.size() === 0 };
		const a = setmetatable({}, meta);
		const b = setmetatable({}, meta);
		output.push(a === b, a === b);
		expect(output[0]).to.equal(true);
		expect(output[1]).to.equal(true);
	});

	it("should preserve table.find metamethod effects before later prerequisites", () => {
		let value = 0;
		const meta = {
			__eq: () => {
				value += 1;
				return true;
			},
		};
		const a = setmetatable({}, meta);
		const b = setmetatable({}, meta);
		const consume = (first: boolean, second: number) => first && second === 7;
		expect(consume([a].includes(b), (value = 7))).to.equal(true);
		expect(value).to.equal(7);
	});

	it("should return the original map when __newindex rebinds the receiver", () => {
		let map = new Map<string, number>();
		const original = map;
		setmetatable(map, {
			__newindex: () => {
				map = new Map();
			},
		});
		const result = map.set("key", 1);
		expect(result).to.equal(original);
		expect(map === original).to.equal(false);
	});

	it("should capture a callback binding when it reassigns itself", () => {
		let callback = (value: number): number => {
			callback = () => 99;
			return value;
		};
		const result = [1, 2].map(callback);
		expect(result[0]).to.equal(1);
		expect(result[1]).to.equal(2);
	});

	it("should preserve nested macro grouping after operand substitution", () => {
		const a = new Vector3(10, 20, 30);
		const b = new Vector3(1, 2, 3);
		const c = new Vector3(3, 4, 5);
		expect(a.sub(b.add(c))).to.equal(new Vector3(6, 14, 22));
	});

	it("should use the default separator for explicit undefined", () => {
		expect([1, 2].join(undefined)).to.equal("1, 2");
	});

	it("should evaluate a separator before converting array elements to strings", () => {
		let separator = ":";
		class Value {
			toString() {
				separator = "!";
				return "v";
			}
		}
		expect([new Value(), new Value()].join(separator)).to.equal("v:v");
	});

	it("should evaluate the key and receiver before a plain assignment value", () => {
		let object = { key: 0 };
		const original = object;
		const change = () => {
			object = { key: 9 };
			return 3;
		};
		object.key = change();
		expect(original.key).to.equal(3);
		expect(object.key).to.equal(9);

		const array = [0, 0];
		let key = 0;
		const changeKey = () => {
			key = 1;
			return 7;
		};
		array[key] = changeKey();
		expect(array[0]).to.equal(7);
		expect(array[1]).to.equal(0);
	});

	it("should evaluate a compound assignment read before tostring", () => {
		let value = "before";
		class Change {
			toString() {
				value = "after";
				return "!";
			}
		}
		const other = new Change();
		value += other;
		expect(value).to.equal("before!");
	});

	it("should evaluate computed assignment receivers before the key", () => {
		let array = [1];
		const original = array;
		const key = () => {
			array = [9];
			return 0;
		};
		array[key()] = 2;
		expect(original[0]).to.equal(2);
		expect(array[0]).to.equal(9);
	});

	it("should preserve object key errors before later argument writes", () => {
		let value = 0;
		const badKey = 0 / 0;
		const consume = (object: object, other: number) => other;
		const [ok] = pcall(() => consume({ [badKey]: true }, (value = 1)));
		expect(ok).to.equal(false);
		expect(value).to.equal(0);
	});

	it("should read a callable property before macro-lowered argument effects", () => {
		const object = { run: (value: number) => value + 1 };
		const change = () => {
			object.run = value => value + 100;
			return 0;
		};
		expect(object.run([1].map(change)[0])).to.equal(1);
		object.run = value => value + 1;
		expect(object["run"]([1].map(change)[0])).to.equal(1);
	});

	it("should pass one nil argument when an inlined scalar call returns no values", () => {
		const empty = (): undefined => {};
		expect(typeOf(empty())).to.equal("nil");
		expect(typeIs(empty(), "nil")).to.equal(true);
		expect([1, 2].join(empty())).to.equal("1, 2");
	});

	it("should preserve reads before a conditionally selected callback changes their binding", () => {
		let value = 1;
		const pure = identity<(() => number) | undefined>(() => 2);
		const change = () => {
			value = 9;
			return 2;
		};
		const callback = pure && [change].pop()!;
		expect(value + callback!()).to.equal(3);
		expect(value).to.equal(9);
	});
};
