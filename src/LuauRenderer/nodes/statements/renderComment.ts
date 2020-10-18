import luau from "LuauAST";
import { RenderState } from "LuauRenderer";
import { getSafeBracketEquals } from "LuauRenderer/util/getSafeBracketEquals";

export function renderComment(state: RenderState, node: luau.Comment) {
	const lines = node.text.split("\n");
	if (lines.length > 1) {
		const eqStr = getSafeBracketEquals(node.text);
		let result = state.line(`--[${eqStr}[`);
		result += state.block(() =>
			lines
				.map(line => line.trim())
				.filter(trimmed => trimmed !== "")
				.map(line => state.line(line))
				.join(""),
		);
		result += state.line(`]${eqStr}]`);
		return result;
	} else {
		return lines.map(line => state.line(`-- ${line.trim()}`)).join("");
	}
}
