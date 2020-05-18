import ts from "byots";

export function isAncestorOf(ancestor: ts.Node, node: ts.Node) {
	do {
		if (ancestor === node) {
			return true;
		}
		node = node.parent;
	} while (node);
	return false;
}

export function skipDownwards(node: ts.Expression): ts.Expression;
export function skipDownwards(node: ts.Node): ts.Node {
	while (ts.isNonNullExpression(node) || ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
		node = node.expression;
	}
	return node;
}

export function skipUpwards(node: ts.Node) {
	let parent = node.parent;
	while (
		parent &&
		(ts.isNonNullExpression(parent) || ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent))
	) {
		node = parent;
		parent = node.parent;
	}
	return node;
}

export function getAncestor<T extends ts.Node>(node: ts.Node, check: (value: ts.Node) => value is T): T | undefined {
	let current: ts.Node | undefined = node;
	while (current && !check(current)) {
		current = current.parent;
	}
	return current;
}

function isSourceFileOrModuleDeclaration(node: ts.Node): node is ts.SourceFile | ts.ModuleDeclaration {
	return ts.isSourceFile(node) || ts.isModuleDeclaration(node);
}

export function getModuleAncestor(node: ts.Node) {
	return getAncestor(node, isSourceFileOrModuleDeclaration)!;
}

export function findFirstChild<T extends ts.Node>(
	children: ReadonlyArray<ts.Node>,
	check: (value: ts.Node) => value is T,
): T | undefined {
	for (const child of children) {
		if (check(child)) {
			return child;
		}
	}
}
