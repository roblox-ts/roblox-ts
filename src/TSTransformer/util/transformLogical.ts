import * as lua from "LuaAST";
import * as tsst from "ts-simple-type";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { wrapConditional, willWrapConditional } from "TSTransformer/util/wrapConditional";
import ts from "typescript";
import { render, RenderState, renderAST } from "LuaRenderer";
import { binaryExpressionChain } from "TSTransformer/util/binaryExpressionChain";

/**
 * Splits `node` recursively by binary operator `operatorKind` into an Array<ts.Expression>
 */
function splitChain(node: ts.Expression, operatorKind: ts.SyntaxKind) {
	const result = new Array<ts.Expression>();
	while (ts.isBinaryExpression(node) && node.operatorToken.kind === operatorKind) {
		result.unshift(node.right);
		node = node.left;
	}
	result.unshift(node);
	return result;
}

function findLastIndex<T>(array: Array<T>, callback: (value: T) => boolean) {
	for (let i = array.length - 1; i >= 0; i--) {
		if (callback(array[i])) {
			return i;
		}
	}
	return -1;
}

function transformLogicalAnd(state: TransformState, node: ts.BinaryExpression) {
	const chain = splitChain(node, ts.SyntaxKind.AmpersandAmpersandToken).map((original, index, array) => {
		const nodeType = state.typeChecker.getTypeAtLocation(original);
		let expression!: lua.Expression;
		const statements = state.statement(() => (expression = transformExpression(state, original)));
		const willWrap = index < array.length - 1 && willWrapConditional(state, nodeType);
		const canInline = lua.list.isEmpty(statements) && !willWrap;
		const type = state.typeChecker.getTypeAtLocation(original);
		return { type, expression, statements, canInline };
	});

	const lastIndex = findLastIndex(chain, v => !v.canInline);

	const prereqExps = chain.slice(0, lastIndex + 1);
	const inlineExps = chain.slice(lastIndex + 1);

	const finalChain = binaryExpressionChain(
		inlineExps.map(v => v.expression),
		lua.BinaryOperator.And,
	);

	if (prereqExps.length === 0) {
		return finalChain;
	}

	const conditionId = lua.tempId();

	function buildPrereqs(index = 0) {
		const expInfo = chain[index];
		if (index <= lastIndex) {
			const condition = wrapConditional(state, conditionId, expInfo.type);
			state.prereqList(expInfo.statements);
			state.prereq(
				lua.create(index === 0 ? lua.SyntaxKind.VariableDeclaration : lua.SyntaxKind.Assignment, {
					left: conditionId,
					right: expInfo.expression,
				}),
			);
			state.prereq(
				lua.create(lua.SyntaxKind.IfStatement, {
					condition,
					statements: state.statement(() => buildPrereqs(index + 1)),
					elseBody: lua.list.make(),
				}),
			);
		} else {
			state.prereq(
				lua.create(lua.SyntaxKind.Assignment, {
					left: conditionId,
					right: finalChain,
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
