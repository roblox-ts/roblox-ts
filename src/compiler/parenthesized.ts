import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";

export function compileParenthesizedExpression(state: CompilerState, node: ts.ParenthesizedExpression) {
	const expStr = compileExpression(state, node.getExpression());
	return `(${expStr})`;
}
