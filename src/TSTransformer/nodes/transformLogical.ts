import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { createTruthinessChecks, willCreateTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getKindName } from "TSTransformer/util/getKindName";
import { isBooleanType, isPossiblyType } from "TSTransformer/util/types";
import ts from "typescript";

function canInline(state: TransformState, left: ts.Expression, operator: ts.SyntaxKind) {
	// TODO: Consider #1868
	const type = state.getType(left);
	if (operator === ts.SyntaxKind.QuestionQuestionToken) {
		// Because #1868, consider any boolean to possibly be `false`
		return !isPossiblyType(type, isBooleanType);
	}
	return !willCreateTruthinessChecks(type);
}

function buildInlineUnlessPrereqs(
	state: TransformState,
	conditionBuilder: (left: luau.Expression) => luau.Expression,
	node: ts.BinaryExpression,
) {
	const left = transformExpression(state, node.left);
	const [right, rightPrereqs] = state.capture(() => transformExpression(state, node.right));
	if (luau.list.isEmpty(rightPrereqs) && canInline(state, node.left, node.operatorToken.kind)) {
		// `??` and `||` both use `or` if inlined
		const operator = node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? "and" : "or";
		return luau.binary(left, operator, right);
	}
	const resultId = state.pushToVar(left, "result");
	luau.list.push(rightPrereqs, luau.create(luau.SyntaxKind.Assignment, { left: resultId, operator: "=", right }));
	state.prereq(
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: conditionBuilder(resultId),
			statements: rightPrereqs,
			elseBody: luau.list.make(),
		}),
	);
	return resultId;
}

export function transformLogical(state: TransformState, node: ts.BinaryExpression): luau.Expression {
	if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
		return buildInlineUnlessPrereqs(
			state,
			conditionId => createTruthinessChecks(state, conditionId, node.left),
			node,
		);
	} else if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
		return buildInlineUnlessPrereqs(
			state,
			conditionId => luau.unary("not", createTruthinessChecks(state, conditionId, node.left)),
			node,
		);
	} else if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
		return buildInlineUnlessPrereqs(state, conditionId => luau.binary(conditionId, "==", luau.nil()), node);
	}
	assert(false, `Operator not implemented: ${getKindName(node.operatorToken.kind)}`);
}
