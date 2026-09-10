// keep tests alphabetized by name to match Jest's snapshot ordering
import { createTestProject } from "./createTestProject";
import { expectSuccess, ReferenceFixture } from "./referenceFixture";

it("emits a module export", () => {
	const project = createTestProject();
	const output = project.compileSource('export const message = "hello";');
	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
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
