import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { assert } from "Shared/util/assert";

export function renderVariableDeclaration(state: RenderState, node: luau.VariableDeclaration) {
	let leftStr;
	if (luau.list.isList(node.left)) {
		assert(!luau.list.isEmpty(node.left));
		leftStr = luau.list.mapToArray(node.left, id => render(state, id)).join(", ");
	} else {
		leftStr = render(state, node.left);
	}
	if (node.right) {
		const rightStr = render(state, node.right);
		return state.line(`local ${leftStr} = ${rightStr}`, node);
	} else {
		return state.line(`local ${leftStr}`, node);
	}
}
