import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformInitializer } from "TSTransformer/util/transformInitializer";

export function transformParameters(state: TransformState, tsParams: ReadonlyArray<ts.ParameterDeclaration>) {
	const parameters = lua.list.make<lua.AnyIdentifier>();
	const statements = lua.list.make<lua.Statement>();
	let hasDotDotDot = false;

	for (const tsParam of tsParams) {
		const paramId = ts.isIdentifier(tsParam.name) ? transformIdentifierDefined(state, tsParam.name) : lua.tempId();

		if (tsParam.dotDotDotToken) {
			hasDotDotDot = true;
			lua.list.push(
				statements,
				lua.create(lua.SyntaxKind.VariableDeclaration, {
					left: paramId,
					right: lua.create(lua.SyntaxKind.Array, {
						members: lua.list.make(lua.create(lua.SyntaxKind.VarArgsLiteral, {})),
					}),
				}),
			);
		} else {
			lua.list.push(parameters, paramId);
		}

		if (tsParam.initializer) {
			lua.list.push(statements, transformInitializer(state, paramId, tsParam.initializer));
		}

		// destructuring
		if (!ts.isIdentifier(tsParam.name)) {
			if (ts.isArrayBindingPattern(tsParam.name)) {
				const bindingPattern = tsParam.name;
				lua.list.pushList(
					statements,
					state.statement(() => transformArrayBindingPattern(state, bindingPattern, paramId)),
				);
			} else {
				const bindingPattern = tsParam.name;
				lua.list.pushList(
					statements,
					state.statement(() => transformObjectBindingPattern(state, bindingPattern, paramId)),
				);
			}
		}
	}

	return {
		parameters,
		statements,
		hasDotDotDot,
	};
}
