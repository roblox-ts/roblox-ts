import { TransformState } from "TSTransformer";
import { extendsRoactComponent } from "TSTransformer/util/extendsRoactComponent";
import { getAncestor } from "TSTransformer/util/traversal";
import ts from "typescript";

export function isInsideRoactComponent(state: TransformState, node: ts.Node) {
	const classLikeAncestor = getAncestor(node, ts.isClassLike);
	if (classLikeAncestor) {
		return extendsRoactComponent(state, classLikeAncestor);
	}
	return false;
}
