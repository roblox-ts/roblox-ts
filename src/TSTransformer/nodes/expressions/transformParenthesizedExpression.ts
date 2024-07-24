import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function transformParenthesizedExpression(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.ParenthesizedExpression,
) {
	const expression = transformExpression(state, prereqs, skipDownwards(node.expression));
	if (luau.isSimple(expression)) {
		return expression;
	} else {
		return luau.create(luau.SyntaxKind.ParenthesizedExpression, { expression });
	}
}
