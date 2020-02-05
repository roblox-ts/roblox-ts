import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";

function pushToVar(state: TransformState, expression: lua.Expression) {
	const temp = lua.tempId();
	state.prereq(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: temp,
			right: expression,
		}),
	);
	return temp;
}

export function pushToVarIfComplex(state: TransformState, expression: lua.Expression) {
	if (lua.isSimple(expression)) {
		return expression;
	}
	return pushToVar(state, expression);
}

export function pushToVarIfNonId(state: TransformState, expression: lua.Expression) {
	if (lua.isIdentifier(expression)) {
		return expression;
	}
	return pushToVar(state, expression);
}
