import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isReturnBlockedByTryStatement } from "TSTransformer/util/isBlockedByTryStatement";
import { skipDownwards } from "TSTransformer/util/traversal";
import { isDefinitelyType, isLuaTupleType } from "TSTransformer/util/types";
import ts from "typescript";

function isTupleReturningCall(state: TransformState, tsExpression: ts.Expression, luaExpression: luau.Expression) {
	const skippedDown = skipDownwards(tsExpression);
	return (
		luau.isCall(luaExpression) &&
		// intentionally NOT using state.getType() here, because that uses skipUpwards
		isDefinitelyType(state, state.typeChecker.getTypeAtLocation(skippedDown), skippedDown, isLuaTupleType(state))
	);
}

export function transformReturnStatementInner(state: TransformState, returnExp: ts.Expression) {
	// Intentionally skipDownwards before transformExpression
	// Otherwise `return (functionThatReturnsLuaTuple())` will be wrong
	let expression: luau.Expression | luau.List<luau.Expression> = transformExpression(state, skipDownwards(returnExp));
	if (
		!isTupleReturningCall(state, returnExp, expression) &&
		isDefinitelyType(state, state.getType(returnExp), returnExp, isLuaTupleType(state))
	) {
		if (luau.isArray(expression)) {
			expression = expression.members;
		} else {
			expression = luau.call(luau.globals.unpack, [expression]);
		}
	}

	if (isReturnBlockedByTryStatement(returnExp)) {
		state.markTryUses("usesReturn");

		return luau.create(luau.SyntaxKind.ReturnStatement, {
			expression: luau.list.make<luau.Expression>(
				state.TS(returnExp, "TRY_RETURN"),
				luau.create(luau.SyntaxKind.Array, {
					members: luau.list.isList(expression) ? expression : luau.list.make(expression),
				}),
			),
		});
	}

	return luau.create(luau.SyntaxKind.ReturnStatement, { expression });
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
	return luau.list.make(transformReturnStatementInner(state, node.expression));
}
