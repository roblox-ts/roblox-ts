import * as ts from "ts-morph";
import { checkNonAny, transpileExpression } from ".";
import { TranspilerState } from "../TranspilerState";

export function transpileSpreadElement(state: TranspilerState, node: ts.SpreadElement) {
	const expression = node.getExpression();
	checkNonAny(expression, true);
	const expStr = transpileExpression(state, expression);
	return `unpack(${expStr})`;
}
