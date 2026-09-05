import { createTestProject } from "./createTestProject";

it("emits a module export", () => {
	const project = createTestProject();
	const output = project.compileSource('export const message = "hello";');
	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});
