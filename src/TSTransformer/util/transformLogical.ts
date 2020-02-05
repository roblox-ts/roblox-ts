import * as lua from "LuaAST";
import { TransformState } from "TSTransformer/TransformState";
import { getNewId } from "TSTransformer/util/getNewId";
import { transformConditional } from "TSTransformer/util/transformConditional";
import ts from "typescript";
import * as tsst from "ts-simple-type";
import { transformExpression } from "TSTransformer/nodes/expressions/expression";

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
	conditionId: lua.Identifier,
	invertCondition: boolean,
	logicChain: Array<ts.Expression>,
	index = 0,
) {
	return state.statement(() => {
		const exp = transformExpression(state, logicChain[index]);
		state.prereq(
			lua.create(index === 0 ? lua.SyntaxKind.VariableDeclaration : lua.SyntaxKind.Assignment, {
				left: conditionId,
				right: exp,
			}),
		);
		if (index < logicChain.length - 1) {
			let condition: lua.Expression = lua.create(lua.SyntaxKind.ParenthesizedExpression, {
				expression: transformConditional(
					conditionId,
					tsst.toSimpleType(state.typeChecker.getTypeAtLocation(logicChain[index]), state.typeChecker),
				),
			});
			if (invertCondition) {
				condition = lua.create(lua.SyntaxKind.UnaryExpression, {
					operator: lua.UnaryOperator.Not,
					expression: condition,
				});
			}
			state.prereq(
				lua.create(lua.SyntaxKind.IfStatement, {
					condition,
					statements: transformLogicalInner(state, conditionId, invertCondition, logicChain, index + 1),
					elseBody: lua.list.make(),
				}),
			);
		}
	});
}

function transformLogicalAnd(state: TransformState, node: ts.BinaryExpression): lua.Expression {
	const conditionId = getNewId();
	const statements = transformLogicalInner(
		state,
		conditionId,
		false,
		buildLogicChain(node, ts.SyntaxKind.AmpersandAmpersandToken),
	);
	lua.list.forEach(statements, s => state.prereq(s));
	return conditionId;
}

function transformLogicalOr(state: TransformState, node: ts.BinaryExpression): lua.Expression {
	const conditionId = getNewId();
	const statements = transformLogicalInner(
		state,
		conditionId,
		true,
		buildLogicChain(node, ts.SyntaxKind.BarBarToken),
	);
	lua.list.forEach(statements, s => state.prereq(s));
	return conditionId;
}

export function transformLogical(state: TransformState, node: ts.BinaryExpression): lua.Expression {
	if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
		return transformLogicalAnd(state, node);
	} else if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
		return transformLogicalOr(state, node);
	}
	throw new Error("???");
}
