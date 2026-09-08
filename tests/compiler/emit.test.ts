// keep tests alphabetized by name to match Jest's snapshot ordering
import { createTestProject } from "./createTestProject";

it("emits a module export", () => {
	const project = createTestProject();
	const output = project.compileSource('export const message = "hello";');
	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});
