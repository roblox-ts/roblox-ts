import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { TemporaryIdentifier } from "LuaAST";

export function pushToVar(state: TransformState, expression: lua.Expression) {
	const temp = lua.tempId();
	state.prereq(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: temp,
			right: expression,
		}),
	);
	return temp;
}

export function pushToVarIfComplex<T extends lua.Expression>(
	state: TransformState,
	expression: T,
): Extract<T, lua.SimpleTypes> | lua.TemporaryIdentifier {
	if (lua.isSimple(expression)) {
		return expression as Extract<T, lua.SimpleTypes>;
	}
	return pushToVar(state, expression);
}

export function pushToVarIfNonId(state: TransformState, expression: lua.Expression) {
	if (lua.isAnyIdentifier(expression)) {
		return expression;
	}
	return pushToVar(state, expression);
}
