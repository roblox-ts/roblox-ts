import { DiagnosticError } from "Shared/errors/DiagnosticError";

import { createTestProject } from "../createTestProject";

it("rejects private JSX tag names during parsing even with semantic checks disabled", () => {
	const project = createTestProject({ allowCommentDirectives: true });
	try {
		project.compileSource("// @ts-nocheck\nconst element = <Component.#value/>;");
		throw new Error("Expected a JSX syntax diagnostic");
	} catch (error) {
		expect(error).toBeInstanceOf(DiagnosticError);
		if (!(error instanceof DiagnosticError)) {
			throw error;
		}
		expect(error.diagnostics.map(diagnostic => diagnostic.code)).toContain(1003);
	}
});
