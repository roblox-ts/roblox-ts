import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { isMethod } from "TSTransformer/util/isMethod";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";

export function transformParameters(state: TransformState, node: ts.SignatureDeclarationBase) {
	const parameters = luau.list.make<luau.AnyIdentifier>();
	const statements = luau.list.make<luau.Statement>();
	let hasDotDotDot = false;

	if (isMethod(state, node)) {
		luau.list.push(parameters, luau.globals.self);
	}

	for (const parameter of node.parameters) {
		if (ts.isThisIdentifier(parameter.name)) {
			continue;
		}

		let paramId: luau.Identifier | luau.TemporaryIdentifier;
		if (ts.isIdentifier(parameter.name)) {
			paramId = transformIdentifierDefined(state, parameter.name);
			validateIdentifier(state, parameter.name);
		} else {
			paramId = luau.tempId();
		}

		if (parameter.dotDotDotToken) {
			hasDotDotDot = true;
			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: paramId,
					right: luau.create(luau.SyntaxKind.Array, {
						members: luau.list.make(luau.create(luau.SyntaxKind.VarArgsLiteral, {})),
					}),
				}),
			);
		} else {
			luau.list.push(parameters, paramId);
		}

		if (parameter.initializer) {
			luau.list.push(statements, transformInitializer(state, paramId, parameter.initializer));
		}

		// destructuring
		if (!ts.isIdentifier(parameter.name)) {
			const bindingPattern = parameter.name;
			if (ts.isArrayBindingPattern(bindingPattern)) {
				luau.list.pushList(
					statements,
					state.capturePrereqs(() => transformArrayBindingPattern(state, bindingPattern, paramId)),
				);
			} else {
				luau.list.pushList(
					statements,
					state.capturePrereqs(() => transformObjectBindingPattern(state, bindingPattern, paramId)),
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
