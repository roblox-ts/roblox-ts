import ts from "byots";

export function createDiagnosticWithLocation(
	id: number,
	message: string,
	category: ts.DiagnosticCategory,
	node: ts.Node,
): ts.DiagnosticWithLocation {
	return {
		category,
		code: (" roblox-ts" as unknown) as number,
		file: node.getSourceFile(),
		messageText: message,
		start: node.getStart(),
		length: node.getWidth(),
		diagnosticType: 0,
		id,
	} as ts.DiagnosticWithLocation;
}
