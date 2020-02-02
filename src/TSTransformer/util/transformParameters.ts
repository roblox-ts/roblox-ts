import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformIdentifier } from "TSTransformer/nodes/expressions/identifier";
import ts from "typescript";

export function transformParameters(state: TransformState, parameters: ReadonlyArray<ts.ParameterDeclaration>) {
	const result = lua.list.make<lua.Identifier>();

	for (const parameter of parameters) {
		if (!ts.isIdentifier(parameter.name)) {
			throw new Error();
		}
		lua.list.push(result, transformIdentifier(state, parameter.name));
	}

	return result;
}
