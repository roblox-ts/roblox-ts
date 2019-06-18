import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { skipNodesDownwards, skipNodesUpwards } from "../utility";

export function compileParenthesizedExpression(state: CompilerState, node: ts.ParenthesizedExpression) {
	const expStr = compileExpression(state, skipNodesDownwards(node.getExpression()));
	return ts.TypeGuards.isExpressionStatement(skipNodesUpwards(node.getParent())) ? expStr : `(${expStr})`;
}
