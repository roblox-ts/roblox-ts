import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { skipDownwards } from "TSTransformer/util/traversal";
import { isLuaTupleType } from "TSTransformer/util/types";
import { isReturnBlockedByTryStatement } from "TSTransformer/util/isBlockedByTryStatement";

function isTupleReturningCall(state: TransformState, tsExpression: ts.Expression, luaExpression: lua.Expression) {
	// intentionally NOT using state.getType() here, because that uses skipUpwards
	return (
		lua.isCall(luaExpression) &&
		isLuaTupleType(state, state.typeChecker.getTypeAtLocation(skipDownwards(tsExpression)))
	);
}

export function transformReturnStatement(state: TransformState, node: ts.ReturnStatement) {
	if (!node.expression) {
		if (isReturnBlockedByTryStatement(node)) {
			state.markTryUses("usesReturn");

			return lua.list.make(
				lua.create(lua.SyntaxKind.ReturnStatement, {
					expression: lua.list.make<lua.Expression>(state.TS("TRY_RETURN"), lua.array()),
				}),
			);
		}

		return lua.list.make(lua.create(lua.SyntaxKind.ReturnStatement, { expression: lua.nil() }));
	}

	let expression: lua.Expression | lua.List<lua.Expression> = transformExpression(
		state,
		skipDownwards(node.expression),
	);
	if (
		isLuaTupleType(state, state.getType(node.expression)) &&
		!isTupleReturningCall(state, node.expression, expression)
	) {
		if (lua.isArray(expression)) {
			expression = expression.members;
		} else {
			expression = lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.unpack,
				args: lua.list.make(expression),
			});
		}
	}

	if (isReturnBlockedByTryStatement(node)) {
		state.markTryUses("usesReturn");

		return lua.list.make(
			lua.create(lua.SyntaxKind.ReturnStatement, {
				expression: lua.list.make<lua.Expression>(
					state.TS("TRY_RETURN"),
					lua.create(lua.SyntaxKind.Array, {
						members: lua.list.isList(expression) ? expression : lua.list.make(expression),
					}),
				),
			}),
		);
	}

	return lua.list.make(lua.create(lua.SyntaxKind.ReturnStatement, { expression }));
}
