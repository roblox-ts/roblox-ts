import * as lua from "LuaAST";
import * as tsst from "ts-simple-type";
import { NodeWithType } from "TSTransformer/types/NodeWithType";
import { assert } from "Shared/util/assert";

function simpleTypeFromNode(node: lua.Node): tsst.SimpleType {
	if (lua.isNumberLiteral(node)) {
		return {
			kind: tsst.SimpleTypeKind.NUMBER_LITERAL,
			value: node.value,
		};
	} else if (lua.isStringLiteral(node)) {
		return {
			kind: tsst.SimpleTypeKind.STRING_LITERAL,
			value: node.value,
		};
	}
	assert(false, "Not implemented");
}

export function createNodeWithType<T extends lua.Node>(node: T): NodeWithType<T> {
	return {
		node,
		type: simpleTypeFromNode(node),
	};
}
