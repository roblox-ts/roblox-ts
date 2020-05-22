import ts from "byots";

export function isReturnBlockedByTryStatement(node: ts.Node) {
	const ancestor = ts.findAncestor(node, ancestor => {
		return ts.isTryStatement(ancestor) || ts.isFunctionLikeDeclaration(ancestor);
	});
	return ancestor && ts.isTryStatement(ancestor);
}

export function isBreakBlockedByTryStatement(node: ts.Node) {
	const ancestor = ts.findAncestor(node, ancestor => {
		return (
			ts.isTryStatement(ancestor) || ts.isIterationStatement(ancestor, false) || ts.isSwitchStatement(ancestor)
		);
	});
	return ancestor && ts.isTryStatement(ancestor);
}
