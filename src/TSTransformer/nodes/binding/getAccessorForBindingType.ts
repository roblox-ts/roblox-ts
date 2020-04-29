import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { assert } from "Shared/util/assert";

type BindingAccessor = (
	state: TransformState,
	parentId: lua.Identifier,
	index: number,
	idStack: Array<lua.Identifier>,
	isHole: boolean,
) => lua.Expression;

const arrayAccessor: BindingAccessor = (state, parentId, index, idStack, isHole) => {
	return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
		expression: parentId,
		index: lua.number(index),
	});
};

export function getAccessorForBindingType(type: ts.Type): BindingAccessor {
	if (true) {
		return arrayAccessor;
	}
	assert(false);
}
