import ts from "byots";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { extendsRoactComponent } from "TSTransformer/util/extendsRoactComponent";
import { getAncestor } from "TSTransformer/util/traversal";

export function validateSuper(state: TransformState, node: ts.Node) {
	const classLikeAncestor = getAncestor(node, ts.isClassLike);
	if (classLikeAncestor && extendsRoactComponent(state, classLikeAncestor)) {
		state.addDiagnostic(diagnostics.noSuperInRoactComponent(node));
	}
}
