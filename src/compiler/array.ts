import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { isIterableIterator } from "../typeUtilities";
import { compileSpreadableList, shouldCompileAsSpreadableList } from "./spread";

export function compileArrayLiteralExpression(state: CompilerState, node: ts.ArrayLiteralExpression) {
	const elements = node.getElements();
	if (elements.length === 0) {
		return "{}";
	}

	// optimizations
	if (elements.length === 1) {
		const element = elements[0];
		if (ts.TypeGuards.isSpreadElement(element)) {
			const expression = element.getExpression();
			const expType = expression.getType();
			if (isIterableIterator(expType, expression)) {
				state.usesTSLibrary = true;
				return `TS.iterable_cache(${compileExpression(state, expression)})`;
			}
		}
	}

	if (shouldCompileAsSpreadableList(elements)) {
		return compileSpreadableList(state, elements);
	} else {
		const elementsStr = elements.map(e => compileExpression(state, e)).join(", ");
		return `{ ${elementsStr} }`;
	}
}
