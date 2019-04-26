import * as ts from "ts-morph";
import { transpileExpression } from ".";
import { CompilerState } from "../CompilerState";

export function transpileParenthesizedExpression(state: CompilerState, node: ts.ParenthesizedExpression) {
	const expStr = transpileExpression(state, node.getExpression());
	return `(${expStr})`;
}
