import { createTestProject } from "./createTestProject";

function compileLoop(source: string, optimizedLoops: boolean) {
	const project = createTestProject({ optimizedLoops });
	return project.compileSource(source);
}

// runtime tests check behavior; snapshots also guard which loops use the numeric-for emitter
// keep cases alphabetized to match snapshot ordering
describe("fallback", () => {
	it.each([
		["ambient constant bound", "declare const limit = 3; for (let i = 0; i < limit; i++) { print(i); }"],
		["arithmetic overflow", "for (let i = 0; i < 9007199254740991 + 1; i++) { print(i); break; }"],
		[
			"changing array-size bound",
			"const values = [1, 2, 3, 4];\n\t\t\tfor (let i = 0; i < values.size(); i++) { values.pop(); }",
		],
		[
			"computed unknown constant",
			"function getLimit(): number { return 3; } const limit = getLimit(); for (let i = 0; i < limit; i++) { print(i); }",
		],
		["destructuring write to induction variable", "for (let i = 0; i < 3; i++) { [i] = [5]; }"],
		[
			"different condition variable",
			"let condition = 2;\n\t\t\tfor (let i = 0; condition < 3; i++) { condition++; print(i); }",
		],
		[
			"different decrement target",
			"let remaining = 3;\n\t\t\tfor (let i = 3; i > 0; remaining -= 1) { if (remaining === 1) break; print(i); }",
		],
		[
			"effectful arithmetic bound",
			'function getLimit(): 3 { print("check"); return 3; } for (let i = 0; i < getLimit() + 1; i++) { print(i); }',
		],
		[
			"effectful bound with a literal return type",
			'function limit(): 2 { print("limit"); return 2; }\n\t\t\tfor (let i = 0; i < limit(); i++) { print(i); }',
		],
		[
			"effectful step",
			'function step(): 1 { print("step"); return 1; } for (let i = 0; i < 3; i += step()) { print(i); }',
		],
		["fractional constant bound", "const limit = 2.5; for (let i = 0; i < limit; i++) { print(i); }"],
		["fractional initializer", "for (let i = 0.5; i < 3; i++) { print(i); }"],
		["multiplicative assignment increment", "for (let i = 1; i < 8; i = i * 2) { print(i); }"],
		["multiplicative step", "for (let i = 1; i < 4; i *= 2) { print(i); }"],
		[
			"mutable constant alias",
			"const initial = 3; let limit = initial; for (let i = 0; i < limit; i++) { limit--; }",
		],
		["mutable identifier bound", "let limit = 3; for (let i = 0; i < limit; i++) { limit--; }"],
		[
			"namespace constant bound",
			"namespace Resources { export const LIMIT = 3; } for (let i = 0; i < Resources.LIMIT; i++) { print(i); }",
		],
		["nonlinear assignment increment", "for (let i = 0; i < 3; i = 1 - i) { print(i); break; }"],
		["nonmutating binary incrementor", "for (let i = 0; i < 3; i + 1) { print(i); break; }"],
		["nonmutating unary incrementor", "for (let i = 0; i < 3; -i) { print(i); break; }"],
		["parameter bound", "function run(limit = 3) { for (let i = 0; i < limit; i++) { limit--; } } run();"],
		["replacing assignment increment", "for (let i = 0; i < 2; i = 1) { print(i); break; }"],
		[
			"step before initialization",
			"function run() { for (let i = 0; i < 1; i += step) { print(i); break; } } run(); const step = 1;",
		],
		[
			"tuple iterator assignment target",
			"declare const iterator: IterableFunction<LuaTuple<[number | undefined, number]>>;\n\t\t\tlet pair: LuaTuple<[number | undefined, number]>;\n\t\t\tfor (pair of iterator) { print(pair[1]); }",
		],
		["unsafe integer bound", "for (let i = 0; i < 9007199254740992; i++) { print(i); break; }"],
		["wrong step direction", "for (let i = 3; i < 0; i--) { print(i); }"],
		["zero constant step", "const step = 0; for (let i = 0; i < 3; i += step) { print(i); break; }"],
		["zero step", "for (let i = 0; i < 1; i += 0) { print(i); break; }"],
	])("%s", (_name, source) => {
		const optimized = compileLoop(source, true);
		const unoptimized = compileLoop(source, false);

		expect(optimized).toBe(unoptimized);
		expect(optimized).toMatchSnapshot();
	});
});

describe("optimized", () => {
	it.each([
		["arithmetic bound", "for (let i = 0; i < 1 + 2; i++) { print(i); }"],
		["arithmetic step", "for (let i = 0; i < 5; i += 1 + 1) { print(i); }"],
		["ascending exclusive bound", "for (let i = 0; i < 3; i++) { print(i); }"],
		["ascending inclusive bound with a step", "for (let i = 0; i <= 4; i += 2) { print(i); }"],
		["assignment increment", "for (let i = 0; i < 3; i = i + 1) { print(i); }"],
		["commuted assignment increment", "for (let i = 0; i < 3; i = 1 + i) { print(i); }"],
		[
			"computed constant bound",
			"function getLimit(): 3 { return 3; } const limit = getLimit(); for (let i = 0; i < limit; i++) { print(i); }",
		],
		[
			"constant alias",
			"const baseLimit: number = 3; const limit = baseLimit; for (let i = 0; i < limit; i++) { print(i); }",
		],
		[
			"constant arithmetic",
			"const baseLimit = 2; const limit = baseLimit * 3 - 1; for (let i = 0; i < limit; i++) { print(i); }",
		],
		["constant assertion", "const limit = 3 as const; for (let i = 0; i < limit; i++) { print(i); }"],
		[
			"constant identifier bound",
			"const MAX_SLOTS = 10; for (let slot = 0; slot < MAX_SLOTS; slot++) { print(slot); }",
		],
		[
			"constant inclusive bounds",
			"const start: number = 1; const limit: number = 3; for (let i = start; i <= limit; i++) { print(i); }",
		],
		["constant satisfies", "const limit = 3 satisfies number; for (let i = 0; i < limit; i++) { print(i); }"],
		["constant step", "const step = 2; for (let i = 0; i < 5; i += step) { print(i); }"],
		["descending assignment increment", "const step = 2; for (let i = 5; i > 0; i = i - step) { print(i); }"],
		[
			"descending constant bounds",
			"const start = 3; const limit = -2; for (let i = start; i > limit; i -= 2) { print(i); }",
		],
		["descending exclusive bound", "for (let i = 3; i > 0; --i) { print(i); }"],
		["descending inclusive bound with a step", "for (let i = 4; i >= 0; i -= 2) { print(i); }"],
		["destructured constant bound", "const [limit] = [3]; for (let i = 0; i < limit; i++) { print(i); }"],
		[
			"destructured literal type",
			"function bounds(): { limit: 3 } { return { limit: 3 }; } const { limit } = bounds(); for (let i = 0; i < limit; i++) { print(i); }",
		],
		["literal spelling", "for (let i = 0x10; i < 2_0; i++) { print(i); }"],
		["negated identifier bound", "const limit = 3; for (let i = 0; i > -limit; i--) { print(i); }"],
		["negative bounds", "for (let i = -1; i >= -3; i--) { print(i); }"],
		["negative constant step", "const step = -1; for (let i = 3; i > 0; i += step) { print(i); }"],
		["negative zero initializer", "for (let i = -0; i <= 0; i++) { print(1 / i); }"],
		["parenthesized bound", "for (let i = 0; i < (3); i++) { print(i); }"],
		["parenthesized condition", "for (let i = 0; (i < 3); i++) { print(i); }"],
		["parenthesized condition variable", "for (let i = 0; (i) < 3; i++) { print(i); }"],
		["parenthesized increment target", "for (let i = 0; i < 3; (i)++) { print(i); }"],
		["parenthesized start", "for (let i = (0); i < 3; i++) { print(i); }"],
		["parenthesized step", "for (let i = 0; i < 3; i += (1)) { print(i); }"],
		["reversed ascending comparison", "for (let i = 0; 3 > i; i++) { print(i); }"],
		["reversed ascending inclusive comparison", "for (let i = 0; 3 >= i; i++) { print(i); }"],
		["reversed descending comparison", "for (let i = 3; 0 < i; i--) { print(i); }"],
		["reversed descending inclusive comparison", "for (let i = 3; 0 <= i; i--) { print(i); }"],
	])("%s", (_name, source) => {
		const optimized = compileLoop(source, true);
		const unoptimized = compileLoop(source, false);

		expect(optimized).not.toBe(unoptimized);
		expect({ optimized, unoptimized }).toMatchSnapshot();
	});
});
