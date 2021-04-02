import luau from "LuauAST";
import { RenderState } from "LuauRenderer";
import { getSafeBracketEquals } from "LuauRenderer/util/getSafeBracketEquals";

export function renderNumberLiteral(state: RenderState, node: luau.NumberLiteral) {
	return luau.isValidNumberLiteral(node.value) ? node.value : String(Number(node.value.replace(/_/g, "")));
}

export function renderStringLiteral(state: RenderState, node: luau.StringLiteral) {
	const isMultiline = node.value.includes("\n");
	if (!isMultiline && !node.value.includes('"')) {
		return `"${node.value}"`;
	} else if (!isMultiline && !node.value.includes("'")) {
		return `'${node.value}'`;
	} else {
		const eqStr = getSafeBracketEquals(node.value);
		return `[${eqStr}[${node.value}]${eqStr}]`;
	}
}
