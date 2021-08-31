import ts from "typescript";
import { TransformState } from "TSTransformer";
import { transformClassLikeDeclaration } from "TSTransformer/nodes/class/transformClassLikeDeclaration";

export function transformClassDeclaration(state: TransformState, node: ts.ClassDeclaration) {
	return transformClassLikeDeclaration(state, node).statements;
}
