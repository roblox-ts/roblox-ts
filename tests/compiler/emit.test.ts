// keep tests alphabetized by name to match Jest's snapshot ordering
import { createTestProject } from "./createTestProject";
import { expectSuccess, ReferenceFixture } from "./referenceFixture";

it("emits a module export", () => {
	const project = createTestProject();
	const output = project.compileSource('export const message = "hello";');
	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it.each(["!strict", "[[ note"])("keeps a block comment starting with %s multi-line", text => {
	const project = createTestProject();
	const output = project.compileSource(`/*\n${text}\n*/\nprint(1);`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toBe(`--[[\n\t\n\t${text}\n\t\n]]\nprint(1)\nreturn nil\n`);
});

it("omits blank lines left by block comment delimiters", () => {
	const project = createTestProject();
	const output = project.compileSource(
		[
			"/**",
			" * indented closing delimiter",
			" */",
			"print(1);",
			"/**",
			"* unindented closing delimiter",
			"*/",
			"print(2);",
			"/*",
			"\topening delimiter on its own line",
			"\tsecond line",
			"*/",
			"print(3);",
			"/*single line*/",
			"print(4);",
		].join("\n"),
	);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("omits blank lines left by block comment delimiters with CRLF line endings", () => {
	const project = createTestProject();
	const output = project.compileSource("/**\r\n * comment\r\n */\r\nprint(1);\r\n");

	// snapshots normalize line endings, which would hide a leftover \r
	expect(output.replace(/^-- Compiled with.*\n/, "")).toBe("--[[\n\t*\r\n\t * comment\n]]\nprint(1)\nreturn nil\n");
});

it("places Luau directives before the compiler header", () => {
	const project = createTestProject();
	const output = project.compileSource("//!strict\n//!native\nexport const value = 1;");

	expect(output.replace(/^-- Compiled with.*\n/m, "")).toMatchSnapshot();
});

it.each([false, true])("respects removeComments: %s for leading and trailing comments", removeComments => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { removeComments });
		fixture.write("game/src/index.ts", "// before\nprint(1);\n// after\n");

		expectSuccess(fixture.createBuild().build());

		const output = fixture.read("out/game/init.luau");
		expect(output.includes("-- before")).toBe(!removeComments);
		expect(output.includes("-- after")).toBe(!removeComments);
		expect(output).toContain("print(1)");
	} finally {
		fixture.close();
	}
});
