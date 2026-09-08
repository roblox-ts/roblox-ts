import { createTestProject } from "./createTestProject";

it("emits a constant $range step without the `or 1` guard", () => {
	const project = createTestProject();
	const output = project.compileSource("for (const i of $range(3, 1, -1)) {}");
	expect(output).toContain("for i = 3, 1, -1 do");
	expect(output).not.toContain("or 1");
});

it("guards a dynamic $range step with `or 1`", () => {
	const project = createTestProject();
	const output = project.compileSource("declare const step: number; for (const i of $range(3, 1, step)) {}");
	expect(output).toContain("for i = 3, 1, step or 1 do");
});
