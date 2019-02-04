import * as ts from "ts-morph";
import { transpileExpression } from ".";
import { TranspilerState } from "../class/TranspilerState";

export function transpileParenthesizedExpression(state: TranspilerState, node: ts.ParenthesizedExpression) {
	const expStr = transpileExpression(state, node.getExpression());
	return `(${expStr})`;
}
