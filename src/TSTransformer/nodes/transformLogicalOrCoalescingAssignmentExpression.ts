import luau from "LuauAST";
import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "byots";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";

function transformCoalescingAssignmentExpression(
	state: TransformState,
	left: ts.LeftHandSideExpression,
	right: ts.Expression,
) {
	const writable = transformWritableExpression(state, left, true);
	const [value, valuePreqreqs] = state.capture(() => transformExpression(state, right));

	const ifStatements = luau.list.make<luau.Statement>();
	luau.list.pushList(ifStatements, valuePreqreqs);
	luau.list.push(
		ifStatements,
		luau.create(luau.SyntaxKind.Assignment, {
			left: writable,
			operator: "=",
			right: value,
		}),
	);

	state.prereq(
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
	left: ts.LeftHandSideExpression,
	right: ts.Expression,
) {
	const writableType = state.getType(left);
	const writable = transformWritableExpression(state, left, true);
	const [value, valuePreqreqs] = state.capture(() => transformExpression(state, right));

	const conditionId = state.pushToVar(writable);

	const ifStatements = luau.list.make<luau.Statement>();
	luau.list.pushList(ifStatements, valuePreqreqs);
	luau.list.push(
		ifStatements,
		luau.create(luau.SyntaxKind.Assignment, {
			left: conditionId,
			operator: "=",
			right: value,
		}),
	);

	state.prereq(
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: createTruthinessChecks(state, writable, writableType),
			statements: ifStatements,
			elseBody: luau.list.make(),
		}),
	);

	state.prereq(
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
	left: ts.LeftHandSideExpression,
	right: ts.Expression,
) {
	const writableType = state.getType(left);
	const writable = transformWritableExpression(state, left, true);
	const [value, valuePreqreqs] = state.capture(() => transformExpression(state, right));

	const conditionId = state.pushToVar(writable);

	const ifStatements = luau.list.make<luau.Statement>();
	luau.list.pushList(ifStatements, valuePreqreqs);
	luau.list.push(
		ifStatements,
		luau.create(luau.SyntaxKind.Assignment, {
			left: conditionId,
			operator: "=",
			right: value,
		}),
	);

	state.prereq(
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: luau.unary("not", createTruthinessChecks(state, writable, writableType)),
			statements: ifStatements,
			elseBody: luau.list.make(),
		}),
	);

	state.prereq(
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
	node: ts.AssignmentExpression<ts.Token<ts.LogicalOrCoalescingAssignmentOperator>>,
): luau.WritableExpression {
	const operator = node.operatorToken.kind;
	if (operator === ts.SyntaxKind.QuestionQuestionEqualsToken) {
		return transformCoalescingAssignmentExpression(state, node.left, node.right);
	} else if (operator === ts.SyntaxKind.AmpersandAmpersandEqualsToken) {
		return transformLogicalAndAssignmentExpression(state, node.left, node.right);
	} else {
		return transformLogicalOrAssignmentExpression(state, node.left, node.right);
	}
}

export function transformLogicalOrCoalescingAssignmentExpressionStatement(
	state: TransformState,
	node: ts.AssignmentExpression<ts.Token<ts.LogicalOrCoalescingAssignmentOperator>>,
): luau.List<luau.Statement> {
	return state.capturePrereqs(() => transformLogicalOrCoalescingAssignmentExpression(state, node));
}
