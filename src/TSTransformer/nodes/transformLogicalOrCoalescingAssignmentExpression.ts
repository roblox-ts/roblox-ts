import luau from "@roblox-ts/luau-ast";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import ts from "typescript";

function transformCoalescingAssignmentExpression(
	state: TransformState,
	prereqs: Prereqs,
	left: ts.LeftHandSideExpression,
	right: ts.Expression,
) {
	const writable = transformWritableExpression(state, prereqs, left, true);
	const valuePreqreqs = new Prereqs();
	const value = transformExpression(state, valuePreqreqs, right);

	const ifStatements = luau.list.make<luau.Statement>();
	luau.list.pushList(ifStatements, valuePreqreqs.statements);
	luau.list.push(
		ifStatements,
		luau.create(luau.SyntaxKind.Assignment, {
			left: writable,
			operator: "=",
			right: value,
		}),
	);

	prereqs.prereq(
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: luau.binary(writable, "==", luau.nil()),
			statements: ifStatements,
			elseBody: luau.list.make(),
		}),
	);

	return writable;
}

function transformLogicalAndAssignmentExpression(
	state: TransformState,
	prereqs: Prereqs,
	left: ts.LeftHandSideExpression,
	right: ts.Expression,
) {
	const writable = transformWritableExpression(state, prereqs, left, true);
	const valuePreqreqs = new Prereqs();
	const value = transformExpression(state, valuePreqreqs, right);

	const conditionId = prereqs.pushToVar(writable, "condition");

	const ifStatements = luau.list.make<luau.Statement>();
	luau.list.pushList(ifStatements, valuePreqreqs.statements);
	luau.list.push(
		ifStatements,
		luau.create(luau.SyntaxKind.Assignment, {
			left: conditionId,
			operator: "=",
			right: value,
		}),
	);

	prereqs.prereq(
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: createTruthinessChecks(state, prereqs, writable, left),
			statements: ifStatements,
			elseBody: luau.list.make(),
		}),
	);

	prereqs.prereq(
		luau.create(luau.SyntaxKind.Assignment, {
			left: writable,
			operator: "=",
			right: conditionId,
		}),
	);

	return writable;
}

function transformLogicalOrAssignmentExpression(
	state: TransformState,
	prereqs: Prereqs,
	left: ts.LeftHandSideExpression,
	right: ts.Expression,
) {
	const writable = transformWritableExpression(state, prereqs, left, true);
	const valuePreqreqs = new Prereqs();
	const value = transformExpression(state, valuePreqreqs, right);

	const conditionId = prereqs.pushToVar(writable, "condition");

	const ifStatements = luau.list.make<luau.Statement>();
	luau.list.pushList(ifStatements, valuePreqreqs.statements);
	luau.list.push(
		ifStatements,
		luau.create(luau.SyntaxKind.Assignment, {
			left: conditionId,
			operator: "=",
			right: value,
		}),
	);

	prereqs.prereq(
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: luau.unary("not", createTruthinessChecks(state, prereqs, writable, left)),
			statements: ifStatements,
			elseBody: luau.list.make(),
		}),
	);

	prereqs.prereq(
		luau.create(luau.SyntaxKind.Assignment, {
			left: writable,
			operator: "=",
			right: conditionId,
		}),
	);

	return writable;
}

export function transformLogicalOrCoalescingAssignmentExpression(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.AssignmentExpression<ts.Token<ts.LogicalOrCoalescingAssignmentOperator>>,
): luau.WritableExpression {
	const operator = node.operatorToken.kind;
	if (operator === ts.SyntaxKind.QuestionQuestionEqualsToken) {
		return transformCoalescingAssignmentExpression(state, prereqs, node.left, node.right);
	} else if (operator === ts.SyntaxKind.AmpersandAmpersandEqualsToken) {
		return transformLogicalAndAssignmentExpression(state, prereqs, node.left, node.right);
	} else {
		return transformLogicalOrAssignmentExpression(state, prereqs, node.left, node.right);
	}
}

export function transformLogicalOrCoalescingAssignmentExpressionStatement(
	state: TransformState,
	node: ts.AssignmentExpression<ts.Token<ts.LogicalOrCoalescingAssignmentOperator>>,
): luau.List<luau.Statement> {
	const prereqs = new Prereqs();
	transformLogicalOrCoalescingAssignmentExpression(state, prereqs, node);
	return prereqs.statements;
}
