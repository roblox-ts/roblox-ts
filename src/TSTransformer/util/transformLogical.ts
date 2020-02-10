import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { binaryExpressionChain } from "TSTransformer/util/binaryExpressionChain";
import { willWrapConditional, wrapConditional } from "TSTransformer/util/wrapConditional";
import ts from "typescript";

/**
 * Splits `node` recursively by binary operator `operatorKind` into an Array<ts.Expression>
 */
function splitBinaryChain(node: ts.Expression, operatorKind: ts.SyntaxKind) {
	const result = new Array<ts.Expression>();
	while (ts.isBinaryExpression(node) && node.operatorToken.kind === operatorKind) {
		result.unshift(node.right);
		node = node.left;
	}
	result.unshift(node);
	return result;
}

function transformLogicalAnd(state: TransformState, node: ts.BinaryExpression) {
	const chain = splitBinaryChain(node, ts.SyntaxKind.AmpersandAmpersandToken).map((original, index, array) => {
		const type = state.typeChecker.getTypeAtLocation(original);
		let expression!: lua.Expression;
		const statements = state.statement(() => (expression = transformExpression(state, original)));
		const willWrap = index < array.length - 1 && willWrapConditional(state, type);
		const inline = lua.list.isEmpty(statements) && !willWrap;
		return { type, expression, statements, inline };
	});

	// merge inline expressions
	for (let i = 0; i < chain.length; i++) {
		const info = chain[i];
		if (info.inline) {
			const exps = [info.expression];
			const j = i + 1;
			while (j < chain.length && chain[j].inline) {
				exps.push(chain[j].expression);
				chain.splice(j, 1);
			}
			info.expression = binaryExpressionChain(exps, lua.BinaryOperator.And);
		}
	}

	// single inline, no temp variable needed
	if (chain.length === 1 && chain[0].inline) {
		return chain[0].expression;
	}

	const conditionId = lua.tempId();

	function buildPrereqs(index = 0) {
		const expInfo = chain[index];
		if (index < chain.length - 1) {
			state.prereqList(expInfo.statements);
			state.prereq(
				lua.create(index === 0 ? lua.SyntaxKind.VariableDeclaration : lua.SyntaxKind.Assignment, {
					left: conditionId,
					right: expInfo.expression,
				}),
			);
			state.prereq(
				lua.create(lua.SyntaxKind.IfStatement, {
					condition: wrapConditional(state, conditionId, expInfo.type),
					statements: state.statement(() => buildPrereqs(index + 1)),
					elseBody: lua.list.make(),
				}),
			);
		} else {
			state.prereq(
				lua.create(lua.SyntaxKind.Assignment, {
					left: conditionId,
					right: expInfo.expression,
				}),
			);
		}
	}
	buildPrereqs();

	return conditionId;
}

export function transformLogical(state: TransformState, node: ts.BinaryExpression): lua.Expression {
	if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
		return transformLogicalAnd(state, node);
	}
	throw new Error("???");
}
