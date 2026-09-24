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
