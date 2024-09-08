import ts from "typescript";

export function arrayBindingPatternContainsSpread(arrayBindingPattern: ts.ArrayBindingPattern): boolean {
	for (const element of arrayBindingPattern.elements) {
		if (ts.isBindingElement(element) && element.dotDotDotToken) return true;

		if (ts.isArrayBindingPattern(element)) {
			if (arrayBindingPatternContainsSpread(element)) return true;
		}
	}
	return false;
}
