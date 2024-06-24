import { SourceFileWithTextRange } from "Shared/types";
import ts from "typescript";

const CODE_PREFIX = " roblox-ts ";

export function getDiagnosticCode(id: number) {
	return (CODE_PREFIX + id) as unknown as number;
}

export function createDiagnosticWithLocation(
	category: ts.DiagnosticCategory,
	id: number,
	messageText: string,
	node: ts.Node | SourceFileWithTextRange,
): ts.DiagnosticWithLocation {
	if ("kind" in node) {
		return {
			category,
			code: getDiagnosticCode(id),
			messageText,
			file: node.getSourceFile(),
			start: node.getStart(),
			length: node.getWidth(),
		};
	} else {
		return {
			category,
			code: getDiagnosticCode(id),
			messageText,
			file: node.sourceFile,
			start: node.range.pos,
			length: node.range.end,
		};
	}
}

export function createTextDiagnostic(category: ts.DiagnosticCategory, id: number, messageText: string): ts.Diagnostic {
	return {
		category,
		code: getDiagnosticCode(id),
		messageText,
		file: undefined,
		start: undefined,
		length: undefined,
	};
}
