import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isReturnBlockedByTryStatement } from "TSTransformer/util/isBlockedByTryStatement";
import { skipDownwards } from "TSTransformer/util/traversal";
import { isLuaTupleType } from "TSTransformer/util/types";

function isTupleReturningCall(state: TransformState, tsExpression: ts.Expression, luaExpression: luau.Expression) {
	// intentionally NOT using state.getType() here, because that uses skipUpwards
	return (
		luau.isCall(luaExpression) &&
		isLuaTupleType(state, state.typeChecker.getTypeAtLocation(skipDownwards(tsExpression)))
	);
}

export function transformReturnStatementInner(state: TransformState, returnExp: ts.Expression) {
	let expression: luau.Expression | luau.List<luau.Expression> = transformExpression(state, skipDownwards(returnExp));
	if (isLuaTupleType(state, state.getType(returnExp)) && !isTupleReturningCall(state, returnExp, expression)) {
		if (luau.isArray(expression)) {
			expression = expression.members;
		} else {
			expression = luau.create(luau.SyntaxKind.CallExpression, {
				expression: luau.globals.unpack,
				args: luau.list.make(expression),
			});
		}
	}

	if (isReturnBlockedByTryStatement(returnExp)) {
		state.markTryUses("usesReturn");

		return luau.create(luau.SyntaxKind.ReturnStatement, {
			expression: luau.list.make<luau.Expression>(
				state.TS("TRY_RETURN"),
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
					expression: luau.list.make<luau.Expression>(state.TS("TRY_RETURN"), luau.array()),
				}),
			);
		}
		return luau.list.make(luau.create(luau.SyntaxKind.ReturnStatement, { expression: luau.nil() }));
	}
	return luau.list.make(transformReturnStatementInner(state, node.expression));
}
