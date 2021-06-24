import luau from "LuauAST";
import { RenderState } from "LuauRenderer";
import { getSafeBracketEquals } from "LuauRenderer/util/getSafeBracketEquals";

function needsBracketSpacing(node: luau.StringLiteral) {
	const parent = node.parent;
	if (!parent) {
		return false;
	}

	if (luau.isMapField(parent) && node === parent.index) {
		return true;
	}

	if (luau.isComputedIndexExpression(parent) && node === parent.index) {
		return true;
	}

	if (luau.isSet(parent)) {
		return true;
	}

	return false;
}

export function renderStringLiteral(state: RenderState, node: luau.StringLiteral) {
	const isMultiline = node.value.includes("\n");
	if (!isMultiline && !node.value.includes('"')) {
		return `"${node.value}"`;
	} else if (!isMultiline && !node.value.includes("'")) {
		return `'${node.value}'`;
	} else {
		const eqStr = getSafeBracketEquals(node.value);
		const spacing = needsBracketSpacing(node) ? " " : "";
		return `${spacing}[${eqStr}[${node.value}]${eqStr}]${spacing}`;
	}
}
