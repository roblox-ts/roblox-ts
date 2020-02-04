import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { getNewId } from "TSTransformer/util/getNewId";

function pushToVar(state: TransformState, expression: lua.Expression) {
	const temp = getNewId();
	state.prereq(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: temp,
			right: expression,
		}),
	);
	return temp;
}

export function pushToVarIfComplex(state: TransformState, expression: lua.Expression) {
	if (
		lua.isIdentifier(expression) ||
		lua.isNumberLiteral(expression) ||
		lua.isStringLiteral(expression) ||
		lua.isTrueLiteral(expression) ||
		lua.isFalseLiteral(expression) ||
		lua.isNilLiteral(expression)
	) {
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
