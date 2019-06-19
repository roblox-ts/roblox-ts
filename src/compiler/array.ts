import * as ts from "ts-morph";
import { compileList, compileSpreadableListAndJoin, compileSpreadExpression, shouldCompileAsSpreadableList } from ".";
import { CompilerState } from "../CompilerState";
import { getType, isArrayType } from "../typeUtilities";
import { skipNodesDownwards } from "../utility";

export function compileArrayLiteralExpression(state: CompilerState, node: ts.ArrayLiteralExpression) {
	const elements = node.getElements();
	if (elements.length === 0) {
		return "{}";
	}

	// optimizations
	if (elements.length === 1) {
		const element = elements[0];
		if (ts.TypeGuards.isSpreadElement(element)) {
			const exp = skipNodesDownwards(element.getExpression());

			if (!isArrayType(getType(exp))) {
				return compileSpreadExpression(state, exp);
			}
		}
	}

	if (shouldCompileAsSpreadableList(elements)) {
		return compileSpreadableListAndJoin(state, elements);
	} else {
		return `{ ${compileList(state, elements).join(", ")} }`;
	}
}
