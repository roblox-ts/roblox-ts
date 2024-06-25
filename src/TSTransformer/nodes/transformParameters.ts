import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { isMethod } from "TSTransformer/util/isMethod";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";
import ts from "typescript";

/**
 * Optimizes parameters in the form `...[a, b, c]: [A, B, C]` to be just `(a, b, c)`
 */
function optimizeArraySpreadParameter(
	state: TransformState,
	prereqs: Prereqs,
	parameters: luau.List<luau.AnyIdentifier>,
	bindingPattern: ts.ArrayBindingPattern,
) {
	for (const element of bindingPattern.elements) {
		if (ts.isOmittedExpression(element)) {
			luau.list.push(parameters, luau.tempId());
		} else {
			if (element.dotDotDotToken) {
				DiagnosticService.addDiagnostic(errors.noSpreadDestructuring(element));
				return;
			}
			const name = element.name;
			if (ts.isIdentifier(name)) {
				const paramId = transformIdentifierDefined(state, name);
				validateIdentifier(state, name);
				luau.list.push(parameters, paramId);
				if (element.initializer) {
					prereqs.prereq(transformInitializer(state, paramId, element.initializer));
				}
			} else {
				const paramId = luau.tempId("param");
				luau.list.push(parameters, paramId);
				if (element.initializer) {
					prereqs.prereq(transformInitializer(state, paramId, element.initializer));
				}
				if (ts.isArrayBindingPattern(name)) {
					transformArrayBindingPattern(state, prereqs, name, paramId);
				} else {
					transformObjectBindingPattern(state, prereqs, name, paramId);
				}
			}
		}
	}
}

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

		if (parameter.dotDotDotToken && ts.isArrayBindingPattern(parameter.name)) {
			const prereqs = new Prereqs();
			optimizeArraySpreadParameter(state, prereqs, parameters, parameter.name as ts.ArrayBindingPattern);
			luau.list.pushList(statements, prereqs.statements);
			continue;
		}

		let paramId: luau.Identifier | luau.TemporaryIdentifier;
		if (ts.isIdentifier(parameter.name)) {
			paramId = transformIdentifierDefined(state, parameter.name);
			validateIdentifier(state, parameter.name);
		} else {
			paramId = luau.tempId("param");
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
			const prereqs = new Prereqs();
			if (ts.isArrayBindingPattern(parameter.name)) {
				transformArrayBindingPattern(state, prereqs, parameter.name, paramId);
			} else {
				transformObjectBindingPattern(state, prereqs, parameter.name, paramId);
			}
			luau.list.pushList(statements, prereqs.statements);
		}
	}

	return {
		parameters,
		statements,
		hasDotDotDot,
	};
}
