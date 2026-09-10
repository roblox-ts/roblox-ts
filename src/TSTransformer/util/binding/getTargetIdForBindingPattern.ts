import luau from "@roblox-ts/luau-ast";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import ts from "typescript";

function bindingPatternContainsInitializers(name: ts.BindingPattern): boolean {
	return name.elements.some(
		element =>
			!ts.isOmittedExpression(element) &&
			(element.initializer !== undefined ||
				(!ts.isIdentifier(element.name) && bindingPatternContainsInitializers(element.name))),
	);
}

/**
 * Checks to see if the binding contains initializers and returns a new temporary identifier,
 * since they could mutate the binding variable.
 */
export function getTargetIdForBindingPattern(prereqs: Prereqs, name: ts.BindingPattern, value: luau.Expression) {
	return luau.isAnyIdentifier(value) && !bindingPatternContainsInitializers(name)
		? value
		: prereqs.pushToVar(value, "binding");
}
