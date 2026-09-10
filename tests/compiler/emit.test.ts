// keep tests alphabetized by name to match Jest's snapshot ordering
import { createTestProject } from "./createTestProject";
import { expectSuccess, ReferenceFixture } from "./referenceFixture";

it("emits a module export", () => {
	const project = createTestProject();
	const output = project.compileSource('export const message = "hello";');
	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("formats JSDoc comments without delimiters or gutters", () => {
	const project = createTestProject();
	const output = project.compileSource(`
		/**
		 * Adds two numbers.
		 *
		 * @example
		 *   add(1, 2)
		 */
		export function add(a: number, b: number) {
			/** One line */
			return a + b;
		}

		/** Text after the delimiter
		 * continues here
		 **/
		print(add(1, 2));
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("formats plain block comments without source indentation", () => {
	const project = createTestProject();
	const output = project.compileSource(`
		/*
		 * Copyright
		 */
		/* first line
		   second line */
		function run() {
			/*
				indented content

				after a blank line
			*/
			print(1);
		}
		run();
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("normalizes CRLF line endings in block comments", () => {
	const project = createTestProject();
	const output = project.compileSource("/**\r\n * first\r\n * second\r\n */\r\nprint(1);\r\n");

	// snapshots normalize line endings, which would hide a leftover \r
	expect(output.replace(/^-- Compiled with.*\n/, "")).toBe("--[[\n\tfirst\n\tsecond\n]]\nprint(1)\nreturn nil\n");
});

it("places Luau directives before the compiler header", () => {
	const project = createTestProject();
	const output = project.compileSource("//!strict\n//!native\nexport const value = 1;");

	expect(output.replace(/^-- Compiled with.*\n/m, "")).toMatchSnapshot();
});

it.each(["!strict", "[[ note"])("renders a one-line block comment starting with %s after a space", text => {
	for (const source of [`/*${text}*/`, `/*\n${text}\n*/`]) {
		const project = createTestProject();
		const output = project.compileSource(`${source}\nprint(1);`);

		// --!strict would be a Luau directive and --[[ would comment out the code after it
		expect(output.replace(/^-- Compiled with.*\n/, "")).toBe(`-- ${text}\nprint(1)\nreturn nil\n`);
	}
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
