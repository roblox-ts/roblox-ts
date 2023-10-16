import { SourceFileWithTextRange } from "Shared/types";
import ts from "typescript";

export function createDiagnosticWithLocation(
	id: number,
	messageText: string,
	category: ts.DiagnosticCategory,
	node: ts.Node | SourceFileWithTextRange,
): ts.DiagnosticWithLocation {
	const code = " roblox-ts" as never;
	const diagnosticType = 0;
	if ("kind" in node) {
		return {
			category,
			code,
			messageText,
			diagnosticType,
			id,
			file: node.getSourceFile(),
			start: node.getStart(),
			length: node.getWidth(),
		} as ts.DiagnosticWithLocation;
	} else {
		return {
			category,
			code,
			messageText,
			diagnosticType,
			id,
			file: node.sourceFile,
			start: node.range.pos,
			length: node.range.end,
		} as ts.DiagnosticWithLocation;
	}
}
