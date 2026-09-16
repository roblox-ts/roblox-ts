export = () => {
	it("destructures IterableIterator sources through their next method", () => {
		function* values() {
			yield 1;
			yield 2;
		}
		const source: IterableIterator<number> = values();
		const [first, second, missing = 7] = source;
		assert(first === 1 && second === 2 && missing === 7);

		let assigned = 0;
		let rest: number[] = [];
		const other: IterableIterator<number> = values();
		[assigned, ...rest] = other;
		assert(assigned === 1 && rest.size() === 1 && rest[0] === 2);
	});

	it("destructures structurally typed generators", () => {
		function* values() {
			yield 3;
			yield 4;
		}
		type Values = Pick<Generator<number>, keyof Generator<number>>;
		const source: Values = values();
		const [first, ...rest] = source;
		assert(first === 3 && rest.size() === 1 && rest[0] === 4);

		let assigned = 0;
		const other: Values = values();
		[, assigned] = other;
		assert(assigned === 4);
	});

	it("resolves variadic tuple positions inside nested rest assignments", () => {
		const source: [number, ...number[][]] = [1, [42], [99]];
		let first = 0;
		let value = 0;
		[first, ...[[value]]] = source;
		assert(first === 1 && value === 42);

		[
			first,
			...{
				0: [value],
			}
		] = source;
		assert(first === 1 && value === 42);

		[first, ...[, ...[[value]]]] = source;
		assert(value === 99);

		[
			...[
				{
					1: [value],
				},
			]
		] = [source];
		assert(value === 42);
	});

	it("resolves generic variadic tuple elements and unions inside nested rest", () => {
		function read<T extends number>(source: [string, ...T[][]]) {
			let value: T;
			[, ...[[value]]] = source;
			return value;
		}
		assert(read(["prefix", [42]]) === 42);

		function readUnion(source: [number, ...number[][]] | [string, ...number[][]]) {
			let value = 0;
			[
				,
				...{
					0: [value],
				}
			] = source;
			return value;
		}
		assert(readUnion(["prefix", [99]]) === 99);
	});

	it("keeps independent assignments inside expression spreads on their own source", () => {
		let value = 0;
		const source = [42];
		// preserve unparenthesized assignments to exercise their immediate array and property parents
		// prettier-ignore
		const arrays = [...[[value] = source]];
		assert(value === 42 && arrays[0] === source);

		// prettier-ignore
		const properties = [...[{ item: [value] = source }]];
		assert(value === 42 && properties[0].item === source);

		const object = { value: 99 };
		// prettier-ignore
		const objects = [...[{ value } = object]];
		assert(value === 99 && objects[0] === object);

		// prettier-ignore
		const nested = [...[[1, [value] = source]]];
		assert(value === 42 && nested[0][1] === source);
	});

	it("evaluates a computed rest key once", () => {
		let calls = 0;
		function key(): "a" {
			calls++;
			return "a";
		}
		const { [key()]: a, ...rest } = { a: 1, b: 2 };
		assert(calls === 1 && a === 1 && rest.b === 2);
	});

	it("retains a computed exclusion key across defaults", () => {
		let key = "a";
		const obj: Record<string, number | undefined> = { b: 2 };
		function fallback() {
			key = "b";
			return 10;
		}
		const { [key]: a = fallback(), ...rest } = obj;
		assert(rest.b === 2);
	});

	it("retains a computed exclusion key across assignments", () => {
		let key = "a";
		let rest: Record<string, string>;
		const obj: Record<string, string> = { a: "b", b: "keep" };
		({ [key]: key, ...rest } = obj);
		assert(rest.b === "keep");
	});

	it("retains the source before computed key prerequisites", () => {
		let obj: Record<string, number> = { a: 1, b: 2 };
		const { [((obj = { a: 10, b: 20 }), "a")]: a, ...rest } = obj;
		assert(a === 1 && rest.b === 2);
	});

	it("evaluates a computed key before the assignment target", () => {
		const events = new Array<string>();
		const source: Record<string, number> = { a: 42 };
		const target = { value: 0 };
		function key() {
			events.push("key");
			return "a";
		}
		function getTarget() {
			events.push("target");
			return target;
		}
		let rest: Record<string, number>;
		({ [key()]: getTarget().value, ...rest } = source);
		assert(events.join(",") === "key,target");
	});

	it("assigns object rest to a property", () => {
		const target = { rest: { a: 0 } };
		({ ...target.rest } = { a: 1 });
		assert(target.rest.a === 1);
	});

	it("assigns object rest to an element", () => {
		const target = [{ a: 0 }];
		({ ...target[0] } = { a: 1 });
		assert(target[0].a === 1);
	});

	it("advances omitted Set bindings before rest", () => {
		const [, ...rest] = new Set([1, 2, 3]);
		assert(rest.size() === 2);
	});

	it("stops an exhausted Set before rest", () => {
		const [first, second = 9, ...rest] = new Set([1]);
		assert(second === 9 && rest.size() === 0);
	});

	it("stops an exhausted Map before rest", () => {
		const [first, second = ["default", 9], ...rest] = new Map([["a", 1]]);
		assert(rest.size() === 0);
		assert(second[0] === "default" && second[1] === 9);
	});

	it("destructures an empty Set with a default and rest", () => {
		const [first = 9, ...rest] = new Set<number>();
		assert(first === 9 && rest.size() === 0);
	});

	it("destructures an empty Map with a default and rest", () => {
		const [first = ["default", 9], ...rest] = new Map<string, number>();
		assert(rest.size() === 0);
		assert(first[0] === "default" && first[1] === 9);
	});

	it("assigns into a nested array rest pattern", () => {
		let first = 0;
		[...[first]] = [1, 2];
		assert(first === 1);
	});

	it("offsets numeric object binding keys on arrays", () => {
		const { 0: first, ...rest } = [10, 20];
		assert(first === 10);
	});

	it("collects rest in a Map loop binding", () => {
		for (const [key, ...rest] of new Map([["a", 42]])) {
			assert(rest[0] === 42);
		}
	});

	it("collects rest in a Map loop assignment", () => {
		let key = "";
		let rest: number[];
		for ([key, ...rest] of new Map([["a", 42]])) {
			assert(key === "a" && rest[0] === 42);
		}
	});

	it("collects rest in a tuple iterator loop binding", () => {
		for (const [first, ...rest] of string.gmatch("ab", "(.)(.)")) {
			assert(rest[0] === "b");
		}
	});

	it("collects rest in a tuple iterator loop assignment", () => {
		let first: string | number;
		let rest: Array<string | number>;
		for ([first, ...rest] of string.gmatch("ab", "(.)(.)")) {
			assert(first === "a" && rest[0] === "b");
		}
	});

	it("ignores generator completion values before rest", () => {
		function* values() {
			yield 1;
			return 99;
		}
		const [a, b = 7, ...rest] = values();
		assert(b === 7 && rest.size() === 0);
	});

	it("retains a generator that rebinds its source", () => {
		let iterator: Generator<number, number>;
		function* values() {
			iterator = other();
			yield 1;
			yield 2;
			return 0;
		}
		function* other() {
			yield 9;
			return 0;
		}
		iterator = values();
		const [a, ...rest] = iterator;
		assert(a === 1 && rest[0] === 2);
	});

	it("preserves undefined positions in generator rest", () => {
		function* values() {
			yield undefined;
			yield 2;
		}
		const [...rest] = values();
		assert(rest[0] === undefined && rest[1] === 2);
	});

	it("stops advancing a completed generator", () => {
		let calls = 0;
		const iterator = {
			next: () => {
				calls++;
				return { done: true as const, value: 99 };
			},
		} as Generator<number, number>;
		const [first = 7, , ...rest] = iterator;
		assert(first === 7 && calls === 1);
	});

	it("advances omitted Map bindings before rest", () => {
		const [, ...rest] = new Map([
			["a", 1],
			["b", 2],
		]);
		assert(rest.size() === 1);
	});

	it("advances omitted Set assignment elements before rest", () => {
		let rest: number[];
		[, ...rest] = new Set([1, 2]);
		assert(rest.size() === 1);
	});

	it("evaluates a rest destination before copying the array", () => {
		const source = [1, 2, 3];
		const target = { rest: new Array<number>() };
		function getTarget() {
			source.push(4);
			return target;
		}
		[...getTarget().rest] = source;
		assert(target.rest.size() === 4);
	});

	it("keeps rest prerequisites in a skipped branch", () => {
		let calls = 0;
		const iterator = (() => {
			calls++;
			return undefined as number | undefined;
		}) as IterableFunction<number>;
		let rest: number[] = [];
		const result = false && ([...rest] = iterator);
		assert(calls === 0);
	});

	it("collects array rest separately on every loop iteration", () => {
		let total = 0;
		for (const [first, ...rest] of [
			[1, 2],
			[3, 4, 5],
		]) {
			total += rest.size();
		}
		assert(total === 3);
	});

	it("collects object rest separately on every loop iteration", () => {
		let total = 0;
		for (const { a, ...rest } of [
			{ a: 1, b: 2 },
			{ a: 3, b: 4 },
		]) {
			total += rest.b;
		}
		assert(total === 6);
	});

	it("supports nested rest parameters", () => {
		function read(...[first, ...rest]: number[]) {
			return rest;
		}
		const rest = read(1, 2, 3);
		assert(rest[0] === 2 && rest[1] === 3);
	});

	it("preserves source types and tuple positions through nested rest assignments", () => {
		let first = 0;
		let second = 0;
		let tail: readonly number[] = [];
		let value = 0;
		[first, ...[[second, ...tail], { value }]] = [1, [2, 3], { value: 4 }] as const;
		assert(first === 1 && second === 2 && tail[0] === 3 && value === 4);

		[...[{ 0: first, [1]: second }]] = [[5, 6]];
		assert(first === 5 && second === 6);

		[...{ 0: first, "1": second }] = [7, 8];
		assert(first === 7 && second === 8);
	});

	it("supports nested rest assignments from every iterable representation", () => {
		let value = 0;
		let tail: number[] = [];
		[...[value, ...tail]] = new Set([1]);
		assert(value === 1 && tail.size() === 0);

		let key: string | number = "";
		[...[[key, value]]] = new Map([["key", 2]]);
		assert(key === "key" && value === 2);

		function* values() {
			yield 3;
			return 99;
		}
		[...[value]] = values();
		assert(value === 3);

		[...[key]] = "🍓a";
		assert(key === "🍓");

		[...[[key]]] = string.gmatch("a,b", "[^,]+");
		assert(key === "a");
	});

	it("resolves computed source properties inside nested rest patterns", () => {
		const source: Array<Record<string, number[]>> = [{ a: [42] }];
		const key: string = "a";
		let value = 0;
		[
			...[
				{
					[key]: [value],
				},
			]
		] = source;
		assert(value === 42);

		const numeric: Array<Record<number, number[]>> = [{ 7: [99] }];
		let index = 7;
		[
			...[
				{
					[index]: [value],
				},
			]
		] = numeric;
		assert(value === 99);
	});

	it("evaluates nested rest defaults once after consuming the source", () => {
		let value = 0;
		let rest: number[] = [];
		const values: Array<number[] | undefined> = [undefined];
		[...[[value, ...rest] = [42, 99]]] = values;
		assert(value === 42 && rest[0] === 99);
	});

	it("preserves falsy Set and Map keys through omitted and exhausted bindings", () => {
		for (const key of [false, 0, ""]) {
			const [, following = "fallback", ...rest] = new Set([key]);
			assert(following === "fallback" && rest.size() === 0);
			const [, pair = ["fallback", 9], ...entries] = new Map([[key, 1]]);
			assert(pair[0] === "fallback" && entries.size() === 0);
		}
	});

	it("collects SharedTable rest and stops after exhaustion", () => {
		const source = new SharedTable();
		source.a = 1;
		source.b = 2;
		const [first, ...rest] = source;
		assert(rest.size() === 1 && first[0] !== rest[0][0]);
		assert(source[first[0]] === first[1] && source[rest[0][0]] === rest[0][1]);

		const [, , missing = ["default", 9], ...empty] = source;
		assert(missing[0] === "default" && empty.size() === 0);

		const [...all] = source;
		assert(all.size() === 2);
		let assignment: Array<[string | number, SharedTableValue]> = [];
		[, ...assignment] = source;
		assert(assignment.size() === 1);

		const { a, ...objectRest } = source;
		assert(a === 1 && objectRest.b === 2);
	});

	it("creates independent plain objects with zero, one, or multiple exclusions", () => {
		const source = setmetatable({ a: 1, b: 2, c: 3 }, {});
		const { ...all } = source;
		const { a, ...tail } = source;
		const { a: first, b: second, ...last } = source;
		assert(all !== source && getmetatable(all) === undefined);
		assert(all.a === 1 && tail.b === 2 && last.c === 3);
		assert((tail as Partial<typeof source>).a === undefined);
		assert((last as Partial<typeof source>).b === undefined);
	});

	it("captures object rest destinations before copying", () => {
		const source = { a: 1, b: 2 };
		const target = [{ a: 0, b: 0 }];
		let calls = 0;
		function index() {
			calls++;
			source.b = 42;
			return 0;
		}
		({ ...target[index()] } = source);
		assert(calls === 1 && target[0].b === 42);
	});

	it("does not write a destructuring default before evaluating it", () => {
		let value: number | undefined = 42;
		let rest: Record<string, number> = {};
		({ value = value, ...rest } = {} as { value?: number });
		assert(value === 42);
	});

	it("resolves named, numeric, and union keys in nested rest source paths", () => {
		let value = 0;
		const source = [{ a: [1], b: [2], 7: [3] }];
		[
			...[
				{
					a: [value],
				},
			]
		] = source;
		assert(value === 1);
		[
			...[
				{
					7: [value],
				},
			]
		] = source;
		assert(value === 3);
		for (const key of ["a", "b"] as const) {
			[
				...[
					{
						[key]: [value],
					},
				]
			] = source;
			assert(value === source[0][key][0]);
		}
		[
			...{
				0: [value],
			}
		] = [[42]];
		assert(value === 42);
	});

	it("preserves optional nested source types through rest defaults", () => {
		let value = 0;
		const arrays: Array<number[] | undefined> = [[1], undefined];
		[...[[value] = [9]]] = arrays;
		assert(value === 1);
		[, ...[[value] = [9]]] = arrays;
		assert(value === 9);
		const objects: Array<{ item?: number[] }> = [{ item: [2] }, {}];
		[...[{ item: [value] = [9] }]] = objects;
		assert(value === 2);
		[, ...[{ item: [value] = [9] }]] = objects;
		assert(value === 9);
	});

	it("spreads empty objects in binding and assignment patterns", () => {
		const source = {};
		const { ...copy } = source;
		let assigned = {};
		({ ...assigned } = source);
		assert(copy !== source && assigned !== source);
	});

	it("reads generator completion state once per step", () => {
		let reads = 0;
		let calls = 0;
		const iterator = {
			next: () => {
				calls++;
				return setmetatable(
					{ value: calls },
					{
						__index: () => {
							reads++;
							return calls > 1;
						},
					},
				) as IteratorResult<number>;
			},
		} as Generator<number>;
		const [first, ...rest] = iterator;
		assert(first === 1 && rest.size() === 0 && reads === 2);
	});

	it("evaluates independent destructuring assignments inside a nested rest default", () => {
		let value = 0;
		let fallback = 0;
		const source = new Array<number[]>();
		[...[[value] = (([fallback] = [42]), [fallback])]] = source;
		assert(value === 42 && fallback === 42);
	});

	it("collects scalar iterator rest like ordinary array spread", () => {
		function values() {
			let value = 0;
			return (() => {
				value++;
				return value <= 3 ? value : undefined;
			}) as IterableFunction<number>;
		}
		const [...rest] = values();
		const spread = [...values()];
		assert(rest.join(",") === "1,2,3" && rest.join(",") === spread.join(","));
	});
};
