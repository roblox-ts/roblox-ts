import { createTestProject } from "./createTestProject";

it.each([
	["map", 'new Map([["a", 1]])'],
	["set", "new Set([1, 2])"],
	["string", '"abc"'],
])("compiles %s spread and iteration without downlevelIteration", (name, expression) => {
	const project = createTestProject();
	const output = project.compileSource(`
		const values = ${expression};
		const copy = [...values];
		for (const value of values) {
			print(value);
		}
		print(copy);
	`);
	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});
