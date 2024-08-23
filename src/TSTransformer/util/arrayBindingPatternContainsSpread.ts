import ts from "typescript";

export function arrayBindingPatternContainsSpread(arrayBindingPattern: ts.ArrayBindingPattern): boolean {
	for (const element of arrayBindingPattern.elements) {
		if (ts.isArrayBindingPattern(element)) {
			if (arrayBindingPatternContainsSpread(element)) return true;
		}

		if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
			if (element.dotDotDotToken) return true;
		}
	}
	return false;
}
