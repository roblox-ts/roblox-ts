import ts from "typescript";

export function arrayLikeExpressionContainsSpread(exp: ts.ArrayBindingPattern | ts.ArrayLiteralExpression): boolean {
	for (const element of exp.elements) {
		if ((ts.isBindingElement(element) && element.dotDotDotToken) || ts.isSpreadElement(element)) return true;
		if (ts.isArrayBindingPattern(element) && arrayLikeExpressionContainsSpread(element)) return true;
	}
	return false;
}
