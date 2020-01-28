import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer";

export function renderNumberLiteral(state: RenderState, node: lua.NumberLiteral) {
	return `${node.value}`;
}

export function renderStringLiteral(state: RenderState, node: lua.StringLiteral) {
	if (!node.value.includes('"')) {
		return `"${node.value}"`;
	} else if (!node.value.includes("'")) {
		return `'${node.value}'`;
	} else {
		let amtEquals = 0;
		while (!node.value.includes(`]${"=".repeat(amtEquals)}]`)) {
			amtEquals++;
		}
		const eqStr = "=".repeat(amtEquals);
		return `[${eqStr}[${node.value}]${eqStr}]`;
	}
}
