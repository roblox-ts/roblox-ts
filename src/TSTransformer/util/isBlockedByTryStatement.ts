import ts from "byots";

export function isReturnBlockedByTryStatement(node: ts.Node) {
	const ancestor = ts.findAncestor(
		node,
		ancestor => ts.isTryStatement(ancestor) || ts.isFunctionLikeDeclaration(ancestor),
	);
	return ancestor !== undefined && ts.isTryStatement(ancestor);
}

export function isBreakBlockedByTryStatement(node: ts.Node) {
	const ancestor = ts.findAncestor(
		node,
		ancestor =>
			ts.isTryStatement(ancestor) || ts.isIterationStatement(ancestor, false) || ts.isSwitchStatement(ancestor),
	);
	return ancestor !== undefined && ts.isTryStatement(ancestor);
}
