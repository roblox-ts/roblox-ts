import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformLogicalOrCoalescingAssignmentExpressionStatement } from "TSTransformer/nodes/transformLogicalOrCoalescingAssignmentExpression";
import { skipDownwards } from "TSTransformer/util/traversal";
import { wrapExpressionStatement } from "TSTransformer/util/wrapExpressionStatement";
import ts from "typescript";

export function transformExpressionStatementInner(
	state: TransformState,
	expression: ts.Expression,
): luau.List<luau.Statement> {
	if (ts.isBinaryExpression(expression) && ts.isLogicalOrCoalescingAssignmentExpression(expression)) {
		return transformLogicalOrCoalescingAssignmentExpressionStatement(state, expression);
	}

	const [expressionResult, expressionPrereqs] = state.capture(() => transformExpression(state, expression));
	luau.list.pushList(expressionPrereqs, wrapExpressionStatement(expressionResult));
	return expressionPrereqs;
}

export function transformExpressionStatement(state: TransformState, node: ts.ExpressionStatement) {
	const expression = skipDownwards(node.expression);
	return transformExpressionStatementInner(state, expression);
}
