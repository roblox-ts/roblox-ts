import luau from "LuauAST";

export function isFinal({ value: node, prev }: luau.ListNode<luau.Statement>): boolean {
	if (luau.isFinalStatement(node)) {
		return true;
	} else if (luau.isIfStatement(node)) {
		if (luau.list.isNonEmpty(node.statements) && isFinal(node.statements.tail)) {
			if (luau.list.isList(node.elseBody)) {
				return luau.list.isNonEmpty(node.elseBody) && isFinal(node.elseBody.tail);
			} else {
				return isFinal({ value: node.elseBody });
			}
		}
	} else if (luau.isDoStatement(node)) {
		return luau.list.isNonEmpty(node.statements) && isFinal(node.statements.tail);
	} else if (luau.isFunctionLike(node)) {
		if (prev) {
			return isFinal(prev);
		}
	}
	return false;
}
