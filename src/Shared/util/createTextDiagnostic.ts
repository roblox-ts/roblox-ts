import ts from "byots";

export function createTextDiagnostic(
	messageText: string,
	category: ts.DiagnosticCategory = ts.DiagnosticCategory.Error,
): ts.Diagnostic {
	return {
		category,
		code: (" roblox-ts" as unknown) as number,
		file: undefined,
		messageText,
		start: undefined,
		length: undefined,
	};
}
