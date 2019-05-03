import * as ts from "ts-morph";
import { compileSpreadableList, compileSpreadExpression, shouldCompileAsSpreadableList } from ".";
import { CompilerState } from "../CompilerState";
import { isArrayType } from "../typeUtilities";
import { compileList } from "./call";

export function compileArrayLiteralExpression(state: CompilerState, node: ts.ArrayLiteralExpression) {
	const elements = node.getElements();
	if (elements.length === 0) {
		return "{}";
	}

	// optimizations
	if (elements.length === 1) {
		const element = elements[0];
		if (ts.TypeGuards.isSpreadElement(element)) {
			const exp = element.getExpression();
			const expType = exp.getType();
			if (!isArrayType(expType)) {
				const spreadResult = compileSpreadExpression(state, exp);
				if (spreadResult) {
					return spreadResult;
				}
			}
		}
	}

	if (shouldCompileAsSpreadableList(elements)) {
		return compileSpreadableList(state, elements);
	} else {
		return `{ ${compileList(state, elements).join(", ")} }`;
	}
}
