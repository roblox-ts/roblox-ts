import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { createTruthinessChecks, willCreateTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { binaryExpressionChain } from "TSTransformer/util/expressionChain";
import { getKindName } from "TSTransformer/util/getKindName";
import { isBooleanLiteralType, isPossiblyType } from "TSTransformer/util/types";
import ts from "typescript";

interface LogicalChainItem {
	node: ts.Expression;
	expression: luau.Expression;
	statements: luau.List<luau.Statement>;
	inline: boolean;
}

/**
 * Splits `node` recursively by binary operator `operatorKind` into an Array<ts.Expression>
 *
 * i.e. using `&&` as our operator, `a && b && c` -> `[a, b, c]`
 */
function flattenByOperator(node: ts.Expression, operatorKind: ts.SyntaxKind) {
	const result = new Array<ts.Expression>();
	while (ts.isBinaryExpression(node) && node.operatorToken.kind === operatorKind) {
		result.unshift(node.right);
		node = node.left;
	}
	result.unshift(node);
	return result;
}

/**
 * Builds an Array<LogicalChainItem> using `splitBinaryChain` and
 * captures all of the prerequisite statements for each expression
 */
function getLogicalChain(
	state: TransformState,
	binaryExp: ts.BinaryExpression,
	binaryOperatorKind: ts.SyntaxKind,
	enableInlining: boolean,
): Array<LogicalChainItem> {
	return flattenByOperator(binaryExp, binaryOperatorKind).map((node, index, array) => {
		const type = state.getType(node);
		const [expression, statements] = state.capture(() => transformExpression(state, node));
		let inline = false;
		if (enableInlining) {
			const willWrap = index < array.length - 1 && willCreateTruthinessChecks(type);
			inline = luau.list.isEmpty(statements) && !willWrap;
		}
		return { node, type, expression, statements, inline };
	});
}

/**
 * Recursively creates prerequisite statements for non-inlined expressions in a logical chain
 */
function buildLogicalChainPrereqs(
	state: TransformState,
	chain: Array<LogicalChainItem>,
	conditionId: luau.TemporaryIdentifier,
	buildCondition: (conditionId: luau.TemporaryIdentifier, node: ts.Expression) => luau.Expression,
	index = 0,
) {
	const expInfo = chain[index];
	state.prereqList(expInfo.statements);
	if (index === 0) {
		state.prereq(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: conditionId,
				right: expInfo.expression,
			}),
		);
	} else {
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: conditionId,
				operator: "=",
				right: expInfo.expression,
			}),
		);
	}
	if (index + 1 < chain.length) {
		state.prereq(
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: buildCondition(conditionId, expInfo.node),
				statements: state.capturePrereqs(() =>
					buildLogicalChainPrereqs(state, chain, conditionId, buildCondition, index + 1),
				),
				elseBody: luau.list.make(),
			}),
		);
	}
}

/**
 * Merges any neighboring inline LogicalChainItems together, builds new expressions using `binaryOperator`
 *
 * i.e. using `and` as our operator,
 * ```TS
 * [{ expression: a, inline: true }, { expression: b, inline: true }, { expression: c, inline: false }]
 * ```
 * turns into
 * ```TS
 * [{ expression: a and b, inline: true }, { expression: c, inline: false }]
 * ```
 */
function mergeInlineExpressions(chain: Array<LogicalChainItem>, binaryOperator: luau.BinaryOperator) {
	for (let i = 0; i < chain.length; i++) {
		const info = chain[i];
		if (info.inline) {
			const exps = [info.expression];
			const j = i + 1;
			while (j < chain.length && chain[j].inline) {
				exps.push(chain[j].expression);
				chain.splice(j, 1);
			}
			info.expression = binaryExpressionChain(exps, binaryOperator);
		}
	}
}

/**
 * Solves the simple case for `&&` / `||` where items can be inlined into `and` / `or` expressions.
 */
function buildInlineConditionExpression(
	state: TransformState,
	node: ts.BinaryExpression,
	tsBinaryOperator: ts.SyntaxKind,
	luaBinaryOperator: luau.BinaryOperator,
	buildCondition: (conditionId: luau.TemporaryIdentifier, node: ts.Expression) => luau.Expression,
) {
	const chain = getLogicalChain(state, node, tsBinaryOperator, true);

	mergeInlineExpressions(chain, luaBinaryOperator);

	// single inline at the end, no temp variable needed
	if (chain.length === 1 && chain[0].inline) {
		return chain[0].expression;
	}

	const conditionId = luau.tempId("condition");
	buildLogicalChainPrereqs(state, chain, conditionId, buildCondition);
	return conditionId;
}

export function transformLogical(state: TransformState, node: ts.BinaryExpression): luau.Expression {
	if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
		return buildInlineConditionExpression(state, node, node.operatorToken.kind, "and", (conditionId, node) =>
			createTruthinessChecks(state, conditionId, node),
		);
	} else if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
		return buildInlineConditionExpression(state, node, node.operatorToken.kind, "or", (conditionId, node) =>
			luau.unary("not", createTruthinessChecks(state, conditionId, node)),
		);
	} else if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
		const conditionBuilder = (conditionId: luau.TemporaryIdentifier) => luau.binary(conditionId, "==", luau.nil());
		if (!isPossiblyType(state.getType(node), isBooleanLiteralType(state, false))) {
			return buildInlineConditionExpression(state, node, node.operatorToken.kind, "or", conditionBuilder);
		}
		const chain = getLogicalChain(state, node, ts.SyntaxKind.QuestionQuestionToken, false);
		const conditionId = luau.tempId("condition");
		buildLogicalChainPrereqs(state, chain, conditionId, conditionBuilder);
		return conditionId;
	}
	assert(false, `Operator not implemented: ${getKindName(node.operatorToken.kind)}`);
}
