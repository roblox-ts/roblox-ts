import * as luau from "LuauAST/bundle";

// if this errors, it means there's an enum in enums.ts that is not defined in mapping.d.ts/nodes.d.ts

export function getAncestorOfKind<T extends luau.SyntaxKind>(node: luau.Node, kind: T): luau.NodeByKind[T] | undefined {
	let parent = node.parent;
	while (parent) {
		if (parent.kind === kind) {
			// hack
			return (parent as unknown) as luau.NodeByKind[T];
		}
		parent = parent.parent;
	}
}
