import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { arrayLikeExpressionContainsSpread } from "TSTransformer/util/arrayLikeExpressionContainsSpread";
import { isMethod } from "TSTransformer/util/isMethod";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";
import {
	analyzeVarArgsOptimization,
	handleVarArgsParameterOptimization,
	VarArgsData,
} from "TSTransformer/util/varArgsOptimization";
import ts from "typescript";

/**
 * Optimizes parameters in the form `...[a, b, c]: [A, B, C]` to be just `(a, b, c)`
 */
function optimizeArraySpreadParameter(
	state: TransformState,
	parameters: luau.List<luau.AnyIdentifier>,
	bindingPattern: ts.ArrayBindingPattern,
) {
	for (const element of bindingPattern.elements) {
		if (ts.isOmittedExpression(element)) {
			luau.list.push(parameters, luau.tempId());
		} else {
			const name = element.name;
			if (ts.isIdentifier(name)) {
				const paramId = transformIdentifierDefined(state, name);
				validateIdentifier(state, name);
				luau.list.push(parameters, paramId);
				if (element.initializer) {
					state.prereq(transformInitializer(state, paramId, element.initializer));
				}
			} else {
				const paramId = luau.tempId("param");
				luau.list.push(parameters, paramId);
				if (element.initializer) {
					state.prereq(transformInitializer(state, paramId, element.initializer));
				}
				if (ts.isArrayBindingPattern(name)) {
					transformArrayBindingPattern(state, name, paramId);
				} else {
					transformObjectBindingPattern(state, name, paramId);
				}
			}
		}
	}
}

export type FunctionLikeWithBody = ts.FunctionLikeDeclarationBase & {
	body: NonNullable<ts.FunctionLikeDeclarationBase["body"]>;
};
export function transformParameters(state: TransformState, node: FunctionLikeWithBody) {
	const parameters = luau.list.make<luau.AnyIdentifier>();
	const statements = luau.list.make<luau.Statement>();
	let hasDotDotDot = false;
	let varArgsData: VarArgsData | undefined;

	if (isMethod(state, node)) {
		luau.list.push(parameters, luau.globals.self);
	}

	for (const parameter of node.parameters) {
		if (ts.isThisIdentifier(parameter.name)) {
			continue;
		}

		if (
			parameter.dotDotDotToken &&
			ts.isArrayBindingPattern(parameter.name) &&
			!arrayLikeExpressionContainsSpread(parameter.name)
		) {
			const prereqs = state.capturePrereqs(() =>
				optimizeArraySpreadParameter(state, parameters, parameter.name as ts.ArrayBindingPattern),
			);
			luau.list.pushList(statements, prereqs);
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
			varArgsData = analyzeVarArgsOptimization(state, node.body, parameter, paramId);
			handleVarArgsParameterOptimization(statements, varArgsData, paramId);
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
		varArgsData,
	};
}
