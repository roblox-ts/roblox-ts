import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformIdentifier } from "TSTransformer/nodes/expressions/transformIdentifier";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";
import ts from "typescript";

export function transformEntityName(state: TransformState, node: ts.EntityName) {
	if (ts.isIdentifier(node)) {
		validateIdentifier(state, node);
		return transformIdentifier(state, node);
	} else {
		return transformQualifiedName(state, node);
	}
}

function transformQualifiedName(state: TransformState, node: ts.QualifiedName): luau.PropertyAccessExpression {
	return luau.property(convertToIndexableExpression(transformEntityName(state, node.left)), node.right.text);
}
