import { errors, getDiagnosticId } from "Shared/diagnostics";
import { DiagnosticError } from "Shared/errors/DiagnosticError";

import { createTestProject } from "./createTestProject";

it.each([
	"declare const values: IterableIterator<number>; const copy = [...values];",
	"declare const values: IterableIterator<number>; for (const value of values) {}",
	"declare const values: any; const copy = [...values];",
	"declare const values: any; for (const value of values) {}",
])("reports unsupported iteration without crashing: %s", source => {
	const project = createTestProject();

	try {
		project.compileSource(source);
		throw new Error("Expected an iteration diagnostic");
	} catch (error) {
		expect(error).toBeInstanceOf(DiagnosticError);
		if (!(error instanceof DiagnosticError)) {
			throw error;
		}
		expect(error.diagnostics.map(getDiagnosticId)).toEqual([errors.noUnsupportedIteration.id]);
		const diagnostic = error.diagnostics[0];
		expect(diagnostic.start).toBe(source.lastIndexOf("values"));
		expect(diagnostic.length).toBe("values".length);
		expect(diagnostic.messageText).toMatchSnapshot();
	}
});
