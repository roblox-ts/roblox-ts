import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import ts from "typescript";

afterEach(() => DiagnosticService.flush());

function diagnostic(code: number, category = ts.DiagnosticCategory.Error): ts.Diagnostic {
	return { code, category, messageText: `diagnostic ${code}`, file: undefined, start: undefined, length: undefined };
}

it("deduplicates single diagnostics until the next compilation boundary", () => {
	const first = diagnostic(1);
	const duplicate = diagnostic(1);
	const second = diagnostic(2);
	DiagnosticService.addSingleDiagnostic(first);
	DiagnosticService.addSingleDiagnostic(duplicate);
	DiagnosticService.addSingleDiagnostic(second);

	expect(DiagnosticService.flush()).toEqual([first, second]);
	DiagnosticService.addSingleDiagnostic(duplicate);
	expect(DiagnosticService.flush()).toEqual([duplicate]);
});

it("keeps cached diagnostics independent from single diagnostics", () => {
	const cache = new Set<string>();
	const first = diagnostic(1);
	DiagnosticService.addDiagnosticWithCache("first", first, cache);
	DiagnosticService.addDiagnosticWithCache("first", diagnostic(1), cache);
	DiagnosticService.addDiagnosticWithCache("second", first, cache);
	DiagnosticService.addSingleDiagnostic(first);

	expect(DiagnosticService.flush()).toEqual([first, first, first]);
	expect(cache).toEqual(new Set(["first", "second"]));
});

it("preserves order and distinguishes warnings from errors", () => {
	const warning = diagnostic(1, ts.DiagnosticCategory.Warning);
	const error = diagnostic(2);
	DiagnosticService.addDiagnostic(warning);
	expect(DiagnosticService.hasErrors()).toBe(false);
	DiagnosticService.addDiagnostics([warning, error]);
	expect(DiagnosticService.hasErrors()).toBe(true);
	expect(DiagnosticService.flush()).toEqual([warning, warning, error]);
	expect(DiagnosticService.hasErrors()).toBe(false);
	expect(DiagnosticService.flush()).toEqual([]);
});
