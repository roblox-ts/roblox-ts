import { TransformState } from "TSTransformer";
import { transformClassLikeDeclaration } from "TSTransformer/nodes/class/transformClassLikeDeclaration";
import ts from "typescript";

export function transformClassDeclaration(state: TransformState, node: ts.ClassDeclaration) {
	return transformClassLikeDeclaration(state, node).statements;
}
