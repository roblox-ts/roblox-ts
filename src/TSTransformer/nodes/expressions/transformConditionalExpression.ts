import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { wrapExpressionStatement } from "TSTransformer/util/wrapExpressionStatement";
import ts from "typescript";

export function transformConditionalExpression(state: TransformState, node: ts.ConditionalExpression) {
	const condition = transformExpression(state, node.condition);
	const [whenTrue, whenTruePrereqs] = state.capture(() => transformExpression(state, node.whenTrue));
	const [whenFalse, whenFalsePrereqs] = state.capture(() => transformExpression(state, node.whenFalse));

	if (isUsedAsStatement(node)) {
		wrapExpressionStatement(whenTrue, whenTruePrereqs);
		wrapExpressionStatement(whenFalse, whenTruePrereqs);
		state.prereq(
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: createTruthinessChecks(state, condition, node.condition),
				statements: whenTruePrereqs,
				elseBody: whenFalsePrereqs,
			}),
		);
		return luau.nil();
	}

	if (luau.list.isEmpty(whenTruePrereqs) && luau.list.isEmpty(whenFalsePrereqs)) {
		return luau.create(luau.SyntaxKind.IfExpression, {
			condition: createTruthinessChecks(state, condition, node.condition),
			expression: whenTrue,
			alternative: whenFalse,
		});
	}

	const tempId = luau.tempId("result");
	state.prereq(
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: tempId,
			right: undefined,
		}),
	);

	luau.list.push(
		whenTruePrereqs,
		luau.create(luau.SyntaxKind.Assignment, {
			left: tempId,
			operator: "=",
			right: whenTrue,
		}),
	);

	luau.list.push(
		whenFalsePrereqs,
		luau.create(luau.SyntaxKind.Assignment, {
			left: tempId,
			operator: "=",
			right: whenFalse,
		}),
	);

	state.prereq(
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: createTruthinessChecks(state, condition, node.condition),
			statements: whenTruePrereqs,
			elseBody: whenFalsePrereqs,
		}),
	);

	return tempId;
}
