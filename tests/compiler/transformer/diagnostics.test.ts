import { assert } from "Shared/util/assert";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

import { createTransformState } from "./createTransformState";

afterEach(() => DiagnosticService.flush());

it("checks a parenthesized spread operand without flattening its element type twice", () => {
	const state = createTransformState("declare const values: Array<Array<any>>; const copy = [...((values))];");
	const source = state.program.getSourceFile("/src/playground.tsx");
	assert(source);
	const statement = source.statements[1];
	assert(ts.isVariableStatement(statement));
	const array = statement.declarationList.declarations[0].initializer;
	assert(array && ts.isArrayLiteralExpression(array));
	const spread = array.elements[0];
	assert(ts.isSpreadElement(spread));

	validateNotAnyType(state, spread);

	expect(DiagnosticService.flush()).toEqual([]);
});

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
