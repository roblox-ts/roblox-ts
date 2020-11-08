import ts from "byots";

export function isValidMethodIndexWithoutCall(parent: ts.Node): boolean {
	// a.b !== undefined
	if (ts.isBinaryExpression(parent)) {
		return true;
	}

	// !a.b
	if (ts.isPrefixUnaryExpression(parent)) {
		return true;
	}

	return false;
}
