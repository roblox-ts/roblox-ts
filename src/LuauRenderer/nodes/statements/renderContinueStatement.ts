import { RenderState } from "LuauRenderer";

export function renderContinueStatement(state: RenderState) {
	return state.line(`continue`);
}
