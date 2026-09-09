import { createTestProject } from "./createTestProject";

it("imports a local module in VirtualProject without project references", () => {
	const project = createTestProject();
	project.vfs.writeFile("/src/value.ts", "export const value = 7;");

	const output = project.compileSource('import { value } from "./value"; export const result = value;');

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});
