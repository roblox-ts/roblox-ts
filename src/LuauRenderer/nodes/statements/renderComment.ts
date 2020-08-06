import luau from "LuauAST";
import { RenderState } from "LuauRenderer";

export function renderComment(state: RenderState, node: luau.Comment) {
	const lines = node.text.split("\n");
	if (lines.length > 1) {
		let result = state.line("--[[");
		result += state.block(() =>
			lines
				.map(line => line.trim())
				.filter(trimmed => trimmed !== "")
				.map(line => state.line(line))
				.join(""),
		);
		result += state.line("]]");
		return result;
	} else {
		return lines.map(line => state.line(`-- ${line.trim()}`)).join("");
	}
}
