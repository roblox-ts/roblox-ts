import * as lua from "LuaAST";

// if this errors, it means there's an enum in enums.ts that is not defined in mapping.d.ts/nodes.d.ts

export function getAncestorOfKind<T extends lua.SyntaxKind>(node: lua.Node, kind: T): lua.NodeByKind[T] | undefined {
	let parent = node.parent;
	while (parent) {
		if (parent.kind === kind) {
			// hack
			return (parent as unknown) as lua.NodeByKind[T];
		}
		parent = parent.parent;
	}
}
