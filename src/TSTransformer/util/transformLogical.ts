import * as lua from "LuaAST";
import * as tsst from "ts-simple-type";
import { transformExpression } from "TSTransformer/nodes/expressions/expression";
import { TransformState } from "TSTransformer/TransformState";
import { getNewId } from "TSTransformer/util/getNewId";
import { transformConditional } from "TSTransformer/util/transformConditional";
import ts from "typescript";

function buildLogicChain(node: ts.Expression, operatorKind: ts.SyntaxKind) {
	const result = new Array<ts.Expression>();
	while (ts.isBinaryExpression(node) && node.operatorToken.kind === operatorKind) {
		result.unshift(node.right);
		node = node.left;
	}
	result.unshift(node);
	return result;
}

function transformLogicalInner(
	state: TransformState,
	conditionId: lua.TemporaryIdentifier,
	buildCondition: (conditionId: lua.TemporaryIdentifier, exp: ts.Expression) => lua.Expression,
	logicChain: Array<ts.Expression>,
	index = 0,
) {
	return state.statement(() => {
		const exp = transformExpression(state, logicChain[index]);
		if (index === 0) {
			state.prereq(
				lua.create(lua.SyntaxKind.VariableDeclaration, {
					left: conditionId,
					right: exp,
				}),
			);
		} else {
			state.prereq(
				lua.create(lua.SyntaxKind.Assignment, {
					left: conditionId,
					right: exp,
				}),
			);
		}
		if (index < logicChain.length - 1) {
			state.prereq(
				lua.create(lua.SyntaxKind.IfStatement, {
					condition: buildCondition(conditionId, logicChain[index]),
					statements: transformLogicalInner(state, conditionId, buildCondition, logicChain, index + 1),
					elseBody: lua.list.make(),
				}),
			);
		}
	});
}

function transformLogicalAnd(state: TransformState, node: ts.BinaryExpression): lua.Expression {
	const conditionId = lua.tempId();
	const statements = transformLogicalInner(
		state,
		conditionId,
		(conditionId, exp) =>
			transformConditional(
				conditionId,
				tsst.toSimpleType(state.typeChecker.getTypeAtLocation(exp), state.typeChecker),
			),
		buildLogicChain(node, ts.SyntaxKind.AmpersandAmpersandToken),
	);
	lua.list.forEach(statements, s => state.prereq(s));
	return conditionId;
}

function transformLogicalOr(state: TransformState, node: ts.BinaryExpression): lua.Expression {
	const conditionId = lua.tempId();
	const statements = transformLogicalInner(
		state,
		conditionId,
		(conditionId, exp) =>
			lua.create(lua.SyntaxKind.UnaryExpression, {
				operator: lua.UnaryOperator.Not,
				expression: lua.create(lua.SyntaxKind.ParenthesizedExpression, {
					expression: transformConditional(
						conditionId,
						tsst.toSimpleType(state.typeChecker.getTypeAtLocation(exp), state.typeChecker),
					),
				}),
			}),
		buildLogicChain(node, ts.SyntaxKind.BarBarToken),
	);
	lua.list.forEach(statements, s => state.prereq(s));
	return conditionId;
}

function transformLogicalNullishCoalescing(state: TransformState, node: ts.BinaryExpression): lua.Expression {
	const conditionId = lua.tempId();
	const statements = transformLogicalInner(
		state,
		conditionId,
		conditionId =>
			lua.create(lua.SyntaxKind.BinaryExpression, {
				left: conditionId,
				operator: lua.BinaryOperator.EqualEqual,
				right: lua.create(lua.SyntaxKind.NilLiteral, {}),
			}),
		buildLogicChain(node, ts.SyntaxKind.QuestionQuestionToken),
	);
	lua.list.forEach(statements, s => state.prereq(s));
	return conditionId;
}

export function transformLogical(state: TransformState, node: ts.BinaryExpression): lua.Expression {
	if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
		return transformLogicalAnd(state, node);
	} else if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
		return transformLogicalOr(state, node);
	} else if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
		return transformLogicalNullishCoalescing(state, node);
	}
	throw new Error("???");
}
