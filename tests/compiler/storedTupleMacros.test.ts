import { createTestProject } from "./createTestProject";

// keep tests alphabetized by name to match Jest's snapshot ordering
it("keeps stored tuple map values unboxed", () => {
	const output = createTestProject().compileSource(`
		declare const values: Map<string, LuaTuple<[number, string]>>;
		export const present = values.get("present");
		export const missing = values.get("missing");
	`);

	expect(output).toMatchSnapshot();
});

it("preserves scalar table removal results through indexing and destructuring", () => {
	const output = createTestProject().compileSource(`
		declare const values: Array<LuaTuple<[number, string]>>;
		export const first = values.shift()![0];
		export const [number, text] = values.remove(0)!;
	`);

	expect(output).toMatchSnapshot();
});

it("stores all reducer return values in the accumulator", () => {
	const output = createTestProject().compileSource(`
		declare const values: Array<LuaTuple<[number, string]>>;
		export function reduce() { return values.reduce(previous => previous); }
	`);

	expect(output).toMatchSnapshot();
});

it("wraps native string macro tuples only when required", () => {
	const output = createTestProject().compileSource(`
		export const stored = "abc".find("b");
		export const [first, last] = "abc".find("b");
	`);

	expect(output).toMatchSnapshot();
});
