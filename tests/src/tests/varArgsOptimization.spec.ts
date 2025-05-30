export = () => {
	it("should support not fail to process various variadic argument functions during optimization", () => {
		function addAll(...n: Array<number>) {
			let sum = 0;
			print(n.size());
			print(n["size"]());
			const k = "size";
			print(n[k]());
			for (const value of n) {
				sum += value;
			}
			return sum;
		}
		function specialIter(...args: number[]) {
			for (const [myIndex, myValue] of args as unknown as Map<number, number>) {
				print(myIndex, myValue);
			}
			const obj = { v: 0 };
			let myValue: number;
			for ([obj.v, myValue] of args as unknown as Map<number, number>) {
				print(obj.v, myValue);
			}
			for ({ a: obj.v, b: obj.v } of args as unknown as { a: number; b: number }[]) {
			}
		}
		function safeTypeof(...args: number[]) {
			print(...(args as typeof args));
		}
		function safe(a: unknown[], ...n123: unknown[]): void;
		function safe(...n: unknown[]) {
			print("Args:", ...n); // expected: `print("Args:", ...)`
			print("First:", n[0]); // expected: `print("First:", (...))`
			print("Second:", n[1]); // expected: `print("Second:", select(2, ...))`
			return $tuple(...n); // expected: return ...
		}
		function safeTupleReturn(...n: unknown[]) {
			return $tuple(n[0], n[1], ...n);
		}
		function safeShadow(...args: number[]) {
			function inner() {
				const args = [1, 2, 3];
				print(...args);
			}
			inner();
			print(...args);
		}
		function safeShadow2(...args: number[]) {
			function inner(...args: number[]) {
				print(...args);
			}
			inner(...args);
		}
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
			let y: unknown[];
			y = args;
		};
		const unsafe5c = (...args: Array<unknown>) => {
			let y: unknown[] | undefined;
			(y as number[]) = args as number[];
		};
		const unsafe6 = (...args: unknown[]) => {
			args = [1];
		};
		const unsafe6b = (...args: unknown[]) => {
			(args as number[]) = [1];
		};
		const unsafe7 = (...args: unknown[]) => {
			print(args);
		};
		const unsafe7b = (...args: unknown[]) => {
			print(args as number[]);
		};
		const unsafe8 = (...args: number[]) => {
			function hi() {
				print(...y);
			}
			const y = args;
			hi();
		};
		const unsafe9 = (...args: number[]) => {
			for (args of [[1, 2]]) {
				print(args);
			}
		};
		const unsafe10 = (...args: unknown[]) => {
			(args as number[]).map(n => n + 1).join("");
		};
		function unsafeTry(...n: defined[]) {
			try {
				print(...n);
			} catch {
				print(...n);
			} finally {
				return $tuple(...n);
			}
		}
		function safeTry(...n: defined[]) {
			try {
				print("Hi");
			} finally {
				print("Done");
			}
			print(...n);
		}
		function safeSameName(...args: number[]) {
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
		function* generatorFn(m: number, ...n: number[]) {
			// hi
			for (const c of n) yield c * m;
		}
		for (const c of generatorFn(10, 1, 3, 2)) print(c);
		async function asyncFn(...n: defined[]) {
			print(...n);
		}
		class Test<T extends unknown[]> {
			allArgs: T;
			constructor(...args: T) {
				this.allArgs = args;
			}
		}
		function unsafeReturnArgs(...args: number[]) {
			return args;
		}

		expect(addAll()).to.equal(0);
	});
};
