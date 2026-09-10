import { createTestProject } from "../createTestProject";

// keep tests alphabetized by name to match Jest's snapshot ordering
it("captures iterators before nested defaults can reassign them", () => {
	const output = createTestProject().compileSource(`
		declare let iterator: IterableFunction<LuaTuple<[number, number?]>>;
		declare const replacement: typeof iterator;
		const [[first, value = (iterator = replacement, 99)], second, ...rest] = iterator;
		print(first, value, second, rest);
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
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

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
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

		expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
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

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});
