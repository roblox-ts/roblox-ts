import { createTestProject } from "./createTestProject";

it.each([
	[
		"boolean cases with a mutable local",
		`let value = true as boolean; switch (value) { case true: value = false; case false: print(value); }`,
	],
	[
		"literal cases with a parameter",
		`function handle(kind: "a" | "b" | "c") {
			switch (kind) {
				case "a": return 1;
				case "b":
				case "c": return 2;
				default: return 0;
			}
		}`,
	],
	[
		"wrapped numeric and template literal cases",
		"function handle(value: number | string) { switch ((value)) { case (1 as number): return 1; case `two`: return 2; } }",
	],
])("avoids operand captures for %s", (_name, source) => {
	const output = createTestProject().compileSource(source);
	expect(output).not.toContain("local _exp");
	expect(output).toMatchSnapshot();
});

it("emits enum case values directly", () => {
	const project = createTestProject();
	const output = project.compileSource(`
		enum Kind {
			A = "A",
			B = "B",
		}
		function handle(value: Kind | "missing", enumAlias: typeof Kind) {
			switch (value) {
				case "missing":
					break;
				case Kind.A:
					break;
				case Kind["B"]:
					break;
				case enumAlias.B:
					break;
			}
		}
	`);
	expect(output).toMatchSnapshot();
});

it.each([
	[
		"case assignments",
		`function handle(value: number) { switch (value) { case (value = 2): return "two"; default: return "original"; } }`,
	],
	[
		"case calls that mutate the parameter",
		`function handle(value: number) {
			function change() { value = 2; return 0; }
			switch (value) { case change(): return "zero"; case 2: return "two"; default: return "original"; }
		}`,
	],
	[
		"hoisted declarations that shadow the operand",
		`function handle(value: string) {
			switch (value) {
				case "a": let value: string | undefined = "inner";
				case "b": return value;
			}
		}`,
	],
	[
		"property operands with literal cases",
		`function handle(value: { kind: string }) { switch (value.kind) { case "a": return 1; case "b": return 2; } }`,
	],
])("retains operand captures for %s", (_name, source) => {
	const output = createTestProject().compileSource(source);
	expect(output).toContain("local _exp");
	expect(output).toMatchSnapshot();
});

it.each([
	[
		"do-while loops",
		`let count = 0; do { count += 1; switch (count) { case 2: continue; } print(count); } while (count < 3);`,
	],
	[
		"fallthrough clauses",
		`for (const value of [1, 2, 3]) {
			switch (value) {
				case 1:
				case 2:
					if (value === 2) { continue; }
					print("one or two");
					break;
				default:
					print("other");
			}
			print(value);
		}`,
	],
	["for-of loops", `for (const value of [1, 2, 3]) { switch (value) { case 2: continue; } print(value); }`],
	[
		"multiple continues in one switch",
		`for (const value of [1, 2, 3]) { switch (value) { case 1: continue; case 2: continue; } print(value); }`,
	],
	[
		"nested switch statements",
		`for (const value of [1, 2]) {
			switch (value) {
				case 2:
					switch (value) { case 2: continue; }
					print("outer");
			}
			print(value);
		}`,
	],
	[
		"unoptimized for loops",
		`for (let i = 0; i < 6; i++) { switch (i) { case 1: continue; case 3: i += 1; break; } print(i); }`,
	],
	[
		"while loops",
		`let count = 0; while (count < 3) { count += 1; switch (count) { case 2: continue; } print(count); }`,
	],
])("continues the enclosing loop from inside a switch for %s", (_name, source) => {
	const output = createTestProject().compileSource(source);
	expect(output).toContain("_continue");
	expect(output).toMatchSnapshot();
});

it.each([
	[
		"loops inside a case",
		`for (const value of [1, 2]) {
			switch (value) {
				case 1:
					for (const inner of [1, 2]) { if (inner === 1) { continue; } print(inner); }
					break;
			}
			print(value);
		}`,
	],
	[
		"switch statements without a continue",
		`for (const value of [1, 2]) { switch (value) { case 1: print("a"); break; default: print("b"); } print(value); }`,
	],
	[
		// the try dispatch emits its own continue inside the repeat, which is tracked separately
		"try statements inside a case",
		`for (const value of [1, 2]) { switch (value) { case 2: try { continue; } finally { print("c"); } } print(value); }`,
	],
])("avoids continue flags for %s", (_name, source) => {
	const output = createTestProject().compileSource(source);
	expect(output).not.toContain("_continue");
	expect(output).toMatchSnapshot();
});
