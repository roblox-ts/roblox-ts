import { createTestProject } from "./createTestProject";

function compileLoop(source: string, optimizedLoops: boolean) {
	const project = createTestProject({ optimizedLoops });
	return project.compileSource(source);
}

// Keep cases alphabetized to match Jest's snapshot ordering. Runtime tests check
// behavior; these snapshots also guard which loops use the numeric-for emitter.
describe("fallback", () => {
	it.each([
		["ambient constant bound", "declare const limit = 3; for (let i = 0; i < limit; i++) { print(i); }"],
		["arithmetic bound", "for (let i = 0; i < 1 + 2; i++) { print(i); }"],
		[
			"changing array-size bound",
			`const values = [1, 2, 3, 4];
			for (let i = 0; i < values.size(); i++) { values.pop(); }`,
		],
		[
			"computed constant bound",
			"function getLimit(): 3 { return 3; } const limit = getLimit(); for (let i = 0; i < limit; i++) { print(i); }",
		],
		["destructured constant bound", "const [limit] = [3]; for (let i = 0; i < limit; i++) { print(i); }"],
		["destructuring write to induction variable", "for (let i = 0; i < 3; i++) { [i] = [5]; }"],
		[
			"different condition variable",
			`let condition = 2;
			for (let i = 0; condition < 3; i++) { condition++; print(i); }`,
		],
		[
			"different decrement target",
			`let remaining = 3;
			for (let i = 3; i > 0; remaining -= 1) { if (remaining === 1) break; print(i); }`,
		],
		[
			"effectful bound with a literal return type",
			`function limit(): 2 { print("limit"); return 2; }
			for (let i = 0; i < limit(); i++) { print(i); }`,
		],
		["fractional constant bound", "const limit = 2.5; for (let i = 0; i < limit; i++) { print(i); }"],
		["fractional initializer", "for (let i = 0.5; i < 3; i++) { print(i); }"],
		["multiplicative step", "for (let i = 1; i < 4; i *= 2) { print(i); }"],
		["mutable identifier bound", "let limit = 3; for (let i = 0; i < limit; i++) { limit--; }"],
		[
			"namespace constant bound",
			"namespace Resources { export const LIMIT = 3; } for (let i = 0; i < Resources.LIMIT; i++) { print(i); }",
		],
		["negated identifier bound", "const limit = 3; for (let i = 0; i > -limit; i--) { print(i); }"],
		["nonmutating unary incrementor", "for (let i = 0; i < 3; -i) { print(i); break; }"],
		["parameter bound", "function run(limit = 3) { for (let i = 0; i < limit; i++) { limit--; } } run();"],
		[
			"tuple iterator assignment target",
			`declare const iterator: IterableFunction<LuaTuple<[number | undefined, number]>>;
			let pair: LuaTuple<[number | undefined, number]>;
			for (pair of iterator) { print(pair[1]); }`,
		],
		["unsafe integer bound", "for (let i = 0; i < 9007199254740992; i++) { print(i); break; }"],
		["wrong step direction", "for (let i = 3; i < 0; i--) { print(i); }"],
		["zero step", "for (let i = 0; i < 1; i += 0) { print(i); break; }"],
	])("%s", (name, source) => {
		const optimized = compileLoop(source, true);
		const unoptimized = compileLoop(source, false);

		// An ineligible loop must emit exactly as it does with optimization disabled.
		expect(optimized).toBe(unoptimized);
		expect(optimized).toMatchSnapshot();
	});
});

describe("optimized", () => {
	it.each([
		["ascending exclusive bound", "for (let i = 0; i < 3; i++) { print(i); }"],
		["ascending inclusive bound with a step", "for (let i = 0; i <= 4; i += 2) { print(i); }"],
		[
			"constant identifier bound",
			"const MAX_SLOTS = 10; for (let slot = 0; slot < MAX_SLOTS; slot++) { print(slot); }",
		],
		[
			"constant inclusive bounds",
			"const start: number = 1; const limit: number = 3; for (let i = start; i <= limit; i++) { print(i); }",
		],
		[
			"descending constant bounds",
			"const start = 3; const limit = -2; for (let i = start; i > limit; i -= 2) { print(i); }",
		],
		["descending exclusive bound", "for (let i = 3; i > 0; --i) { print(i); }"],
		["descending inclusive bound with a step", "for (let i = 4; i >= 0; i -= 2) { print(i); }"],
		["literal spelling", "for (let i = 0x10; i < 2_0; i++) { print(i); }"],
		["negative bounds", "for (let i = -1; i >= -3; i--) { print(i); }"],
		["negative zero initializer", "for (let i = -0; i <= 0; i++) { print(1 / i); }"],
	])("%s", (name, source) => {
		const optimized = compileLoop(source, true);
		const unoptimized = compileLoop(source, false);

		expect(optimized).not.toBe(unoptimized);
		expect({ optimized, unoptimized }).toMatchSnapshot();
	});
});
