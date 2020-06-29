import luau from "LuauAST";
import { RenderState } from "LuauRenderer";

export function renderNumberLiteral(state: RenderState, node: luau.NumberLiteral) {
	// TODO exponents?
	return `${node.value}`;
}

export function renderStringLiteral(state: RenderState, node: luau.StringLiteral) {
	const isMultiline = node.value.includes("\n");
	if (!isMultiline && !node.value.includes('"')) {
		return `"${node.value}"`;
	} else if (!isMultiline && !node.value.includes("'")) {
		return `'${node.value}'`;
	} else {
		let amtEquals = 0;
		while (node.value.includes(`]${"=".repeat(amtEquals)}]`)) {
			amtEquals++;
		}
		const eqStr = "=".repeat(amtEquals);
		return `[${eqStr}[${node.value}]${eqStr}]`;
	}
}
