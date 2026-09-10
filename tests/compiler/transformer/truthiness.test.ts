import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import ts from "typescript";

import { createTestProject } from "../createTestProject";

afterEach(() => {
	jest.restoreAllMocks();
	DiagnosticService.flush();
});

it.each([
	["number", "0, NaN"],
	["string", '""'],
	["number | string", '0, NaN, ""'],
])("reports the extra truthiness checks for %s without changing output", (type, checks) => {
	const source = `export function truthy(value: ${type}) { return !!value; }`;
	const original = createTestProject().compileSource(source);
	const add = jest.spyOn(DiagnosticService, "addDiagnostic");
	const output = createTestProject({ logTruthyChanges: true }).compileSource(source);

	expect(output).toBe(original);
	expect(add).toHaveBeenCalledTimes(1);
	expect(add.mock.calls[0][0]).toMatchObject({
		category: ts.DiagnosticCategory.Warning,
		messageText: `Value will be checked against ${checks}`,
	});
});

it("does not warn when a boolean needs no additional checks", () => {
	const add = jest.spyOn(DiagnosticService, "addDiagnostic");
	createTestProject({ logTruthyChanges: true }).compileSource(
		"export function truthy(value: boolean) { return !!value; }",
	);

	expect(add).not.toHaveBeenCalled();
});
