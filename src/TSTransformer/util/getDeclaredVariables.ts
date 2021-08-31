import ts from "typescript";

function getDeclaredVariablesFromBindingName(node: ts.BindingName, list: Array<ts.Identifier>) {
	if (ts.isIdentifier(node)) {
		list.push(node);
	} else if (ts.isObjectBindingPattern(node)) {
		for (const element of node.elements) {
			getDeclaredVariablesFromBindingName(element.name, list);
		}
	} else if (ts.isArrayBindingPattern(node)) {
		for (const element of node.elements) {
			if (!ts.isOmittedExpression(element)) {
				getDeclaredVariablesFromBindingName(element.name, list);
			}
		}
	}
}

export function getDeclaredVariables(node: ts.VariableDeclarationList | ts.VariableDeclaration) {
	const list = new Array<ts.Identifier>();
	if (ts.isVariableDeclarationList(node)) {
		for (const declaration of node.declarations) {
			getDeclaredVariablesFromBindingName(declaration.name, list);
		}
	} else {
		getDeclaredVariablesFromBindingName(node.name, list);
	}
	return list;
}
