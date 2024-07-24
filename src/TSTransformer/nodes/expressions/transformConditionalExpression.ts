import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { wrapExpressionStatement } from "TSTransformer/util/wrapExpressionStatement";
import ts from "typescript";

export function transformConditionalExpression(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.ConditionalExpression,
) {
	const condition = transformExpression(state, prereqs, node.condition);

	const whenTruePrereqs = new Prereqs();
	const whenTrue = transformExpression(state, whenTruePrereqs, node.whenTrue);

	const whenFalsePrereqs = new Prereqs();
	const whenFalse = transformExpression(state, whenFalsePrereqs, node.whenFalse);

	if (isUsedAsStatement(node)) {
		whenTruePrereqs.prereqList(wrapExpressionStatement(whenTrue));
		whenFalsePrereqs.prereqList(wrapExpressionStatement(whenFalse));
		prereqs.prereq(
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: createTruthinessChecks(state, prereqs, condition, node.condition),
				statements: whenTruePrereqs.statements,
				elseBody: whenFalsePrereqs.statements,
			}),
		);
		return luau.none();
	}

	if (luau.list.isEmpty(whenTruePrereqs.statements) && luau.list.isEmpty(whenFalsePrereqs.statements)) {
		return luau.create(luau.SyntaxKind.IfExpression, {
			condition: createTruthinessChecks(state, prereqs, condition, node.condition),
			expression: whenTrue,
			alternative: whenFalse,
		});
	}

	const tempId = luau.tempId("result");
	prereqs.prereq(
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: tempId,
			right: undefined,
		}),
	);

	whenTruePrereqs.prereq(
		luau.create(luau.SyntaxKind.Assignment, {
			left: tempId,
			operator: "=",
			right: whenTrue,
		}),
	);

	whenFalsePrereqs.prereq(
		luau.create(luau.SyntaxKind.Assignment, {
			left: tempId,
			operator: "=",
			right: whenFalse,
		}),
	);

	prereqs.prereq(
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: createTruthinessChecks(state, prereqs, condition, node.condition),
			statements: whenTruePrereqs.statements,
			elseBody: whenFalsePrereqs.statements,
		}),
	);

	return tempId;
}
