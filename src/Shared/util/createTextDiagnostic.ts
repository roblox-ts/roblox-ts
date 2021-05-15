import ts from "byots";

export function createTextDiagnostic(
	code: number,
	messageText: string,
	category: ts.DiagnosticCategory = ts.DiagnosticCategory.Error,
): ts.Diagnostic {
	return {
		category,
		code: ` roblox-ts ${code}` as never,
		file: undefined,
		messageText,
		start: undefined,
		length: undefined,
	};
}
