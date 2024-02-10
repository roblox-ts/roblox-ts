import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import ts from "typescript";

export function transformEntityName(state: TransformState, node: ts.EntityName) {
	return ts.isIdentifier(node) ? transformIdentifierDefined(state, node) : transformQualifiedName(state, node);
}

function transformQualifiedName(state: TransformState, node: ts.QualifiedName): luau.PropertyAccessExpression {
	return luau.property(transformEntityName(state, node.left), node.right.text);
}
