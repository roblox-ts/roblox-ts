import * as ts from "ts-morph";
import { checkNonAny, transpileCallExpression, transpileExpression } from ".";
import { TranspilerState } from "../TranspilerState";
import { isTupleReturnTypeCall } from "../typeUtilities";

export function transpileSpreadElement(state: TranspilerState, node: ts.SpreadElement) {
	const expression = node.getExpression();
	checkNonAny(expression, true);

	if (ts.TypeGuards.isCallExpression(expression) && isTupleReturnTypeCall(expression)) {
		return transpileCallExpression(state, expression, true);
	} else {
		return `unpack(${transpileExpression(state, expression)})`;
	}
}
