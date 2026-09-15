import { createTestProject } from "./createTestProject";

it.each([
	["dynamic identifier retains fallback", "declare const step: number; for (const i of $range(3, 1, step)) {}"],
	["dynamic negation retains fallback", "declare const step: number; for (const i of $range(3, 1, -step)) {}"],
	["negative literal omits fallback", "for (const i of $range(3, 1, -1)) {}"],
	["parenthesized negative literal omits fallback", "for (const i of $range(3, 1, (-1))) {}"],
])("%s", (_name, source) => {
	expect(createTestProject().compileSource(source)).toMatchSnapshot();
});
