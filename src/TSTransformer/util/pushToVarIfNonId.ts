import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { getNewId } from "./getNewId";

export function pushToVarIfNonId(state: TransformState, expression: lua.Expression) {
	if (lua.isIdentifier(expression)) {
		return expression;
	}
	const temp = getNewId();
	state.prereq(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: temp,
			right: expression,
		}),
	);
	return temp;
}
