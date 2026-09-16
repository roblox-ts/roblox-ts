import { createTestProject } from "../createTestProject";

// keep tests alphabetized by name to match Jest's snapshot ordering
it("captures iterators before nested defaults can reassign them", () => {
	const output = createTestProject().compileSource(`
		declare let iterator: IterableFunction<LuaTuple<[number, number?]>>;
		declare const replacement: typeof iterator;
		const [[first, value = (iterator = replacement, 99)], second, ...rest] = iterator;
		print(first, value, second, rest);
	`);

	expect(output).toMatchSnapshot();
});

it("captures reassignable iterators before preceding bindings", () => {
	const output = createTestProject().compileSource(`
		let calls = 0;
		let iterator: IterableFunction<number>;
		iterator = (() => {
			calls++;
			iterator = ((): number => { throw "replacement iterator"; }) as IterableFunction<number>;
			return calls <= 3 ? calls : undefined;
		}) as IterableFunction<number>;
		const [first, second, ...rest] = iterator;
		print(first, second, rest);
	`);

	expect(output).toMatchSnapshot();
});

it.each(["number", "LuaTuple<[number, string]>"])(
	"captures rest assignment targets before collecting %s iterators",
	type => {
		const output = createTestProject().compileSource(`
			declare const iterator: IterableFunction<${type}>;
			declare function target(): Array<Array<${type}>>;
			declare function key(): number;
			[...target()[key()]] = iterator;
		`);

		expect(output).toMatchSnapshot();
	},
);

it.each([
	["fixed tuples", "LuaTuple<[number, string]>"],
	["single values", "number"],
	["variadic tuples", "LuaTuple<Array<string>>"],
])("collects iterator rest bindings with %s after preceding elements", (name, type) => {
	const output = createTestProject().compileSource(`
		declare const iterator: IterableFunction<${type}>;
		export const [first, , ...rest] = iterator;
	`);

	expect(output).toMatchSnapshot();
});

it.each(["number", "LuaTuple<[number, string]>"])("guards iterator assignment targets after exhaustion (%s)", type => {
	const output = createTestProject().compileSource(`
			declare const iterator: IterableFunction<${type}>;
			declare function target(): { value: ${type}; rest: Array<${type}> };
			declare function fallback(): ${type};
			[target().value = fallback(), , ...target().rest] = iterator;
		`);

	expect(output).toMatchSnapshot();
});

it("keeps nested rest within a LuaTuple value", () => {
	const output = createTestProject().compileSource(`
		declare function values(): LuaTuple<[Array<number>, number]>;
		const [[first, ...rest], last] = values();
		print(first, rest, last);
	`);

	expect(output).toMatchSnapshot();
});

// keep cases alphabetized to match Jest's snapshot ordering
it.each([
	["array suffix", "function read(source: number[]) { const [first, ...rest] = source; return rest; }"],
	[
		"computed object keys",
		`let key = "a";
		const source: Record<string, number | undefined> = { b: 2 };
		function fallback() { key = "b"; return 10; }
		const { [key]: value = fallback(), ...rest } = source;
		print(value, rest);`,
	],
	[
		"generator completion",
		`function* values() { yield 1; return 99; }
		const [first, second = 7, ...rest] = values(); print(first, second, rest);`,
	],
	["map first element", "function read(source: Map<string, number>) { const [first] = source; return first; }"],
	["map loop rest", `for (const [key, ...rest] of new Map([["a", 42]])) { print(key, rest); }`],
	[
		"map prefix and rest",
		`function read(source: Map<string, number>) { const [first, , ...rest] = source; return rest; }`,
	],
	[
		"nested rest assignment",
		`let value = 0; let tail: number[];
		[...[value, ...tail]] = [1, 2, 3]; print(value, tail);`,
	],
	[
		"object rest exclusions",
		`function read(source: { a: number; b: number; c: number }) {
		const { ...all } = source;
		const { a, ...tail } = source;
		const { a: first, b: second, ...last } = source;
		return [all, tail, last];
	}`,
	],
	[
		"object rest member assignment",
		`const target = [{ a: 0 }];
		let index = 0; ({ ...target[index++] } = { a: 42 }); print(target);`,
	],
	[
		"scalar iterator rest",
		`declare const source: IterableFunction<number>;
		const [first, , ...rest] = source; print(first, rest);`,
	],
	["set first element", "function read(source: Set<number>) { const [first] = source; return first; }"],
	[
		"set prefix and rest",
		`function read(source: Set<number>) { const [, second = 9, ...rest] = source; return rest; }`,
	],
	["shared table rest", `function read(source: SharedTable) { const [first, ...rest] = source; return rest; }`],
	[
		"source capture",
		`let source: Record<string, number> = { a: 1, b: 2 };
		const { [(source = { a: 10, b: 20 }, "a")]: first, ...rest } = source;
		print(first, rest);`,
	],
	["string rest", `function read(source: string) { const [first, , ...rest] = source; return rest; }`],
	[
		"tuple iterator loop rest",
		`let first: string | number; let rest: Array<string | number>;
		for ([first, ...rest] of string.gmatch("ab", "(.)(.)")) { print(first, rest); }`,
	],
])("preserves rest destructuring emit for %s", (name, source) => {
	expect(createTestProject().compileSource(source)).toMatchSnapshot();
});

it("rejects multiple object rest elements before lowering", () => {
	expect(() => createTestProject().compileSource("const { ...first, ...second } = {};")).toThrow();
});

it("supports narrowed iterator result declarations in nested rest", () => {
	// this declaration describes an external iterator that never terminates, so test its lowering without running it
	const output = createTestProject().compileSource(`
		interface Numbers extends IterableFunction<number> {
			[Symbol.iterator](): { next: () => IteratorYieldResult<number> };
		}
		declare const source: Numbers;
		let value = 0;
		[...[value]] = source;
		print(value);
	`);
	expect(output).toMatchSnapshot();
});
