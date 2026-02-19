export = () => {
	it("should not fail to process various optimizable variadic argument functions", () => {
		function addAll(...n: Array<number>) {
			let sum = 0;
			for (const value of n) {
				sum += value;
			}
			return sum;
		}
		expect(addAll(1, 2, 3)).to.equal(6);

		function sizeUsages(...args: Array<number>) {
			let n = args.size();
			n += args["size"]();
			const k = "size";
			n += args[k]();
			return n;
		}
		expect(sizeUsages(1, 2, 3)).to.equal(9);

		function sumUsingRange(...args: Array<number>) {
			let sum = 0;
			for (const i1 of $range(1, args.size())) {
				sum += args[i1 - 1];
			}
			return sum;
		}
		expect(sumUsingRange(1, 2, 3)).to.equal(6);

		function specialIter1(...args: Array<number>) {
			let sum = 0;
			for (const [myIndex, myValue] of args as unknown as Map<number, number>) {
				sum += myIndex * 10 + myValue;
			}
			return sum;
		}
		expect(specialIter1(2, 4, 6)).to.equal(72); // 12 + 24 + 36

		function specialIter2(...args: Array<unknown>) {
			const obj = { v: 0 };
			let myValue: number;
			let sum = 0;
			for ([obj.v, myValue] of args as unknown as Map<number, number>) {
				sum += obj.v * 10 + myValue;
			}
			return sum;
		}
		expect(specialIter2(2, 4, 6)).to.equal(72); // 12 + 24 + 36

		function specialIter3(...args: Array<unknown>) {
			const obj = { k: 0, v: 0 };
			let sum = 0;
			for ({ a: obj.k, b: obj.v } of args as unknown as { a: number; b: number }[]) {
				sum += obj.k * 10 + obj.v;
			}
			return sum;
		}
		expect(specialIter3({ a: 1, b: 2 }, { a: 2, b: 4 }, { a: 3, b: 6 })).to.equal(72); // 12 + 24 + 36

		function safeTypeof(...args: Array<number>) {
			return addAll(...(args as typeof args));
		}
		expect(safeTypeof(1, 2, 3)).to.equal(6);

		function _print(...args: unknown[]) {}
		function safe(a: number, ...n: Array<number>): LuaTuple<Array<number>>; // Header should not affect safety/compilation
		function safe(...n: Array<number>) {
			_print("Args:", ...n); // expected: `_print("Args:", ...)`
			_print("First:", n[0]); // expected: `_print("First:", (...))`
			_print("Second:", n[1]); // expected: `_print("Second:", select(2, ...))`
			return $tuple(n[0], ...n); // expected: return ...
		}
		expect(addAll(...safe(1, 2, 3))).to.equal(7); // first argument is duplicated

		function safeShadow1(...args: Array<number>) {
			function inner() {
				const args = [1, 2, 3];
				return addAll(...args);
			}
			const sum = inner();
			return sum + addAll(...args);
		}
		expect(safeShadow1(10, 20)).to.equal(36);

		function safeShadow2(...args: Array<number>) {
			function inner(...args: Array<number>) {
				return addAll(...args);
			}
			return inner(...args);
		}
		expect(safeShadow2(1, 2, 3)).to.equal(6);

		const unsafe1 = (...args: Array<number>) => {
			args.push(1);
		};
		const unsafe2 = (...args: Array<number>) => {
			args.sort();
		};
		const unsafe3 = (...args: Array<unknown>) => {
			return () => {
				print(...args);
			};
		};
		const unsafe4 = (...args: Array<unknown>) => {
			args[0] = 3;
		};
		const unsafe5 = (...args: Array<unknown>) => {
			const y = args;
			// unsafe because we might do something to 'y' and expect it to also occur to 'args'
		};
		const unsafe5b = (...args: Array<unknown>) => {
			let y: Array<unknown>;
			y = args;
		};
		const unsafe5c = (...args: Array<unknown>) => {
			let y: Array<unknown> | undefined;
			(y as Array<number>) = args as Array<number>;
		};
		const unsafe6 = (...args: Array<unknown>) => {
			args = [1];
		};
		const unsafe6b = (...args: Array<unknown>) => {
			(args as Array<number>) = [1];
		};
		const unsafe7 = (...args: Array<unknown>) => {
			print(args);
		};
		const unsafe7b = (...args: Array<unknown>) => {
			print(args as Array<number>);
		};
		const unsafe8 = (...args: Array<number>) => {
			function inner() {
				print(...y);
			}
			const y = args;
			inner();
		};
		const unsafe9 = (...args: Array<number>) => {
			for (args of [[1, 2]]) {
				print(args);
			}
		};
		const unsafe10 = (...args: Array<unknown>) => {
			(args as Array<number>).map(n => n + 1).join("");
		};
		function unsafeTry(...n: Array<defined>) {
			try {
				print(...n);
			} catch {
				print(...n);
			} finally {
				return $tuple(...n);
			}
		}
		function safeTry(...n: Array<number>) {
			try {
				print("Hi");
			} finally {
				print("Done");
			}
			return addAll(...n);
		}
		expect(safeTry(1, 2, 3)).to.equal(6);

		function safeSameName(...args: Array<number>) {
			const myObj = {
				args: [1],
			};
			print(myObj.args, myObj.args[0], myObj.args.size());
			myObj.args.push(1);
			myObj.args[1] = 2;
			myObj.args[args[0]] = 1;
			print(args[args[0]]);
			print(myObj.args[args[0]]);
			print(myObj["args"][args[0]]);
			print(args[tonumber("0")!]);
		}

		function* generatorFn(m: number, ...n: Array<number>) /* Comment */ {
			// Comments shouldn't mess with compilation
			for (const c of n) yield c * m;
		}
		let sum = 0;
		for (const c of generatorFn(10, 1, 3, 2)) sum += c;
		expect(sum).to.equal(60);

		async function asyncFn(...n: Array<defined>) {
			print(...n);
		}

		class Test<T extends Array<unknown>> {
			allArgs: T;
			constructor(...args: T) {
				this.allArgs = args;
			}
		}
		expect(addAll(...new Test(1, 2, 3).allArgs)).to.equal(6);

		function unsafeReturnArgs(...args: Array<number>) {
			return args;
		}
		expect(type(unsafeReturnArgs(1, 2, 3))).to.equal("table");
		expect(unsafeReturnArgs(1, 2, 3)[0]).to.equal(1);
	});
};
