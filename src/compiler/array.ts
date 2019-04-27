import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { compileSpreadableList, shouldCompileAsSpreadableList } from "./spread";

export function compileArrayLiteralExpression(state: CompilerState, node: ts.ArrayLiteralExpression) {
	const elements = node.getElements();
	if (elements.length === 0) {
		return "{}";
	}

	if (shouldCompileAsSpreadableList(elements)) {
		return compileSpreadableList(state, elements);
	} else {
		const elementsStr = elements.map(e => compileExpression(state, e)).join(", ");
		return `{ ${elementsStr} }`;
	}
}
