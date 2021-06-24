import luau from "LuauAST";

export function isComplexStringLiteral(node: luau.Node) {
	if (!luau.isStringLiteral(node)) {
		return false;
	}
	const isMultiline = node.value.includes("\n");
	if (!isMultiline && !node.value.includes('"')) {
		return false;
	} else if (!isMultiline && !node.value.includes("'")) {
		return false;
	} else {
		return true;
	}
}
