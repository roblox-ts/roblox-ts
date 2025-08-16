import luau from "@roblox-ts/luau-ast";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isReturnBlockedByTryStatement } from "TSTransformer/util/isBlockedByTryStatement";
import { skipDownwards } from "TSTransformer/util/traversal";
import { getFirstDefinedSymbol, isLuaTupleType } from "TSTransformer/util/types";
import ts from "typescript";

function isTupleReturningCall(state: TransformState, tsExpression: ts.Expression, luaExpression: luau.Expression) {
	// intentionally NOT using state.getType() here, because that uses skipUpwards
	return (
		luau.isCall(luaExpression) &&
		isLuaTupleType(state)(state.typeChecker.getTypeAtLocation(skipDownwards(tsExpression)))
	);
}

function isTupleMacro(state: TransformState, expression: ts.Expression) {
	if (ts.isCallExpression(expression)) {
		const symbol = getFirstDefinedSymbol(state, state.getType(expression.expression));
		if (symbol && symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.$tuple)) {
			return true;
		}
	}
	return false;
}

export function transformReturnStatementInner(
	state: TransformState,
	returnExp: ts.Expression,
): luau.List<luau.Statement> {
	const result = luau.list.make<luau.Statement>();

	let expression: luau.Expression | luau.List<luau.Expression>;

	const innerReturnExp = skipDownwards(returnExp);
	if (ts.isCallExpression(innerReturnExp) && isTupleMacro(state, innerReturnExp)) {
		const [args, prereqs] = state.capture(() => ensureTransformOrder(state, innerReturnExp.arguments));
		luau.list.pushList(result, prereqs);
		expression = luau.list.make(...args);
	} else {
		expression = transformExpression(state, innerReturnExp);
		if (isLuaTupleType(state)(state.getType(returnExp)) && !isTupleReturningCall(state, returnExp, expression)) {
			if (luau.isArray(expression)) {
				expression = expression.members;
			} else {
				expression = luau.call(luau.globals.unpack, [expression]);
			}
		}
	}

	if (isReturnBlockedByTryStatement(returnExp)) {
		state.markTryUses("usesReturn");
		luau.list.push(
			result,
			luau.create(luau.SyntaxKind.ReturnStatement, {
				expression: luau.list.make<luau.Expression>(
					state.TS(returnExp, "TRY_RETURN"),
					luau.create(luau.SyntaxKind.Array, {
						members: luau.list.isList(expression) ? expression : luau.list.make(expression),
					}),
				),
			}),
		);
	} else {
		luau.list.push(result, luau.create(luau.SyntaxKind.ReturnStatement, { expression }));
	}

	return result;
}

export function transformReturnStatement(state: TransformState, node: ts.ReturnStatement) {
	if (!node.expression) {
		if (isReturnBlockedByTryStatement(node)) {
			state.markTryUses("usesReturn");
			return luau.list.make(
				luau.create(luau.SyntaxKind.ReturnStatement, {
					expression: luau.list.make<luau.Expression>(state.TS(node, "TRY_RETURN"), luau.array()),
				}),
			);
		}
		return luau.list.make(luau.create(luau.SyntaxKind.ReturnStatement, { expression: luau.nil() }));
	}
	return transformReturnStatementInner(state, node.expression);
}
