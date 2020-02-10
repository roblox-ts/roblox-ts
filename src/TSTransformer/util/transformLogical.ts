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
		let willWrap = false;
		if (index < array.length - 1) {
			willWrap = willWrapConditional(state, nodeType);
		}
		const canInline = lua.list.isEmpty(statements) && !willWrap;
		return { original, expression, statements, canInline };
	});

	const lastIndex = findLastIndex(chain, v => !v.canInline);

	const expsWithPrereq = chain.slice(0, lastIndex + 1);
	const expsWithoutPrereq = chain.slice(lastIndex + 1);

	console.log(expsWithPrereq.map(v => render(new RenderState(), v.expression)));
	console.log(expsWithoutPrereq.map(v => render(new RenderState(), v.expression)));

	return lua.tempId();
}

export function transformLogical(state: TransformState, node: ts.BinaryExpression): lua.Expression {
	if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
		return transformLogicalAnd(state, node);
	}
	throw new Error("???");
}
