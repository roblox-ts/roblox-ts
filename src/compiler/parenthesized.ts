import ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { getNonNullUnParenthesizedExpressionUpwards } from "../utility";

export function compileParenthesizedExpression(state: CompilerState, node: ts.ParenthesizedExpression) {
	const expStr = compileExpression(state, node.getExpression());
	return ts.TypeGuards.isExpressionStatement(getNonNullUnParenthesizedExpressionUpwards(node.getParent()))
		? expStr
		: `(${expStr})`;
}
