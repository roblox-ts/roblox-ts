import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { binaryExpressionChain } from "TSTransformer/util/binaryExpressionChain";
import { createTruthinessChecks, willCreateTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import ts from "typescript";

interface LogicalChainItem {
	type: ts.Type;
	expression: lua.Expression;
	statements: lua.List<lua.Statement>;
	inline: boolean;
}

/**
 * Splits `node` recursively by binary operator `operatorKind` into an Array<ts.Expression>
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
	node: ts.BinaryExpression,
	binaryOperatorKind: ts.SyntaxKind,
	enableInlining: boolean,
): Array<LogicalChainItem> {
	return flattenByOperator(node, binaryOperatorKind).map((original, index, array) => {
		const type = state.typeChecker.getTypeAtLocation(original);
		const { expression, statements } = state.capturePrereqs(() => transformExpression(state, original));
		let inline = false;
		if (enableInlining) {
			const willWrap = index < array.length - 1 && willCreateTruthinessChecks(state, type);
			inline = lua.list.isEmpty(statements) && !willWrap;
		}
		return { type, expression, statements, inline };
	});
}

/**
 * Recursively creates prerequisite statements for non-inlined expressions in a logical chain
 */
function buildLogicalChainPrereqs(
	state: TransformState,
	chain: Array<LogicalChainItem>,
	conditionId: lua.TemporaryIdentifier,
	buildCondition: (conditionId: lua.TemporaryIdentifier, type: ts.Type) => lua.Expression,
	index = 0,
) {
	const expInfo = chain[index];
	state.prereqList(expInfo.statements);
	state.prereq(
		lua.create(index === 0 ? lua.SyntaxKind.VariableDeclaration : lua.SyntaxKind.Assignment, {
			left: conditionId,
			right: expInfo.expression,
		}),
	);
	if (index + 1 < chain.length) {
		state.prereq(
			lua.create(lua.SyntaxKind.IfStatement, {
				condition: buildCondition(conditionId, expInfo.type),
				statements: state.statement(() =>
					buildLogicalChainPrereqs(state, chain, conditionId, buildCondition, index + 1),
				),
				elseBody: lua.list.make(),
			}),
		);
	}
}

/**
 * Merges neighboring inline LogicalChainItems together, builds new expressions using `binaryOperator`
 */
function mergeInlineExpressions(chain: Array<LogicalChainItem>, binaryOperator: lua.BinaryOperator) {
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
	luaBinaryOperator: lua.BinaryOperator,
	buildCondition: (conditionId: lua.TemporaryIdentifier, type: ts.Type) => lua.Expression,
) {
	const chain = getLogicalChain(state, node, tsBinaryOperator, true);
	mergeInlineExpressions(chain, luaBinaryOperator);

	// single inline, no temp variable needed
	if (chain.length === 1 && chain[0].inline) {
		return chain[0].expression;
	}

	const conditionId = lua.tempId();
	buildLogicalChainPrereqs(state, chain, conditionId, buildCondition);
	return conditionId;
}

export function transformLogical(state: TransformState, node: ts.BinaryExpression): lua.Expression {
	if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
		return buildInlineConditionExpression(
			state,
			node,
			node.operatorToken.kind,
			lua.BinaryOperator.And,
			(conditionId, type) => createTruthinessChecks(state, conditionId, type),
		);
	} else if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
		return buildInlineConditionExpression(
			state,
			node,
			node.operatorToken.kind,
			lua.BinaryOperator.Or,
			(conditionId, type) => {
				let expression = createTruthinessChecks(state, conditionId, type);

				if (!lua.isSimple(expression)) {
					expression = lua.create(lua.SyntaxKind.ParenthesizedExpression, {
						expression,
					});
				}

				return lua.create(lua.SyntaxKind.UnaryExpression, {
					operator: lua.UnaryOperator.Not,
					expression,
				});
			},
		);
	} else if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
		/*
		  nullish coalescing is similar to and/or transformation, but:
		  - doesn't use wrapConditional
		  - cannot inline
		*/
		const chain = getLogicalChain(state, node, ts.SyntaxKind.QuestionQuestionToken, false);
		const conditionId = lua.tempId();
		buildLogicalChainPrereqs(state, chain, conditionId, conditionId =>
			lua.create(lua.SyntaxKind.BinaryExpression, {
				left: conditionId,
				operator: lua.BinaryOperator.EqualEqual,
				right: lua.nil(),
			}),
		);
		return conditionId;
	}
	throw new Error("???");
}
