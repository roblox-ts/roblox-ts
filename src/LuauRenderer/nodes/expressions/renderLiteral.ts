import luau from "LuauAST";
import { RenderState } from "LuauRenderer";
import { isValidLuauNumberLiteral } from "Shared/util/isValidLuauNumberLiteral";

export function renderNumberLiteral(state: RenderState, node: luau.NumberLiteral) {
	return isValidLuauNumberLiteral(node.value) ? node.value : String(Number(node.value.replace(/_/g, "")));
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
