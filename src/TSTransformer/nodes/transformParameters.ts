import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { isMethod } from "TSTransformer/util/isMethod";

export function transformParameters(state: TransformState, node: ts.SignatureDeclarationBase) {
	const parameters = lua.list.make<lua.AnyIdentifier>();
	const statements = lua.list.make<lua.Statement>();
	let hasDotDotDot = false;

	if (isMethod(state, node)) {
		lua.list.push(parameters, lua.globals.self);
	}

	for (const parameter of node.parameters) {
		if (ts.isThisIdentifier(parameter.name)) {
			continue;
		}

		const paramId = ts.isIdentifier(parameter.name)
			? transformIdentifierDefined(state, parameter.name)
			: lua.tempId();

		if (parameter.dotDotDotToken) {
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

		if (parameter.initializer) {
			lua.list.push(statements, transformInitializer(state, paramId, parameter.initializer));
		}

		// destructuring
		if (!ts.isIdentifier(parameter.name)) {
			const bindingPattern = parameter.name;
			if (ts.isArrayBindingPattern(bindingPattern)) {
				lua.list.pushList(
					statements,
					state.capturePrereqs(() => transformArrayBindingPattern(state, bindingPattern, paramId)),
				);
			} else {
				lua.list.pushList(
					statements,
					state.capturePrereqs(() => transformObjectBindingPattern(state, bindingPattern, paramId)),
				);
			}
		}

		// parameter property
		if (ts.isParameterPropertyDeclaration(parameter, parameter.parent)) {
			assert(lua.isIdentifier(paramId), "Parameter property was not an identifier");
			lua.list.push(
				statements,
				lua.create(lua.SyntaxKind.Assignment, {
					left: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
						expression: lua.globals.self,
						name: paramId.name,
					}),
					right: paramId,
				}),
			);
		}
	}

	return {
		parameters,
		statements,
		hasDotDotDot,
	};
}
