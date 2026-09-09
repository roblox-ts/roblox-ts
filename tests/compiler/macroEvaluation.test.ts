import { createTestProject } from "./createTestProject";
import { macroEvaluationCases } from "./fixtures/macroEvaluation";

describe("macro emit", () => {
	const project = createTestProject();
	beforeAll(() => {
		project.vfs.writeFile(
			"/src/stableImports.ts",
			"export declare const lighting: Lighting; export declare const useValue: (value: number | undefined) => number;",
		);
	});

	it.each(macroEvaluationCases)("$name", ({ source }) => {
		expect(project.compileSource(source).replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
	});
});
