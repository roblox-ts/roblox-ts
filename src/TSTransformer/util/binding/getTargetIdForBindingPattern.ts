import luau from "@roblox-ts/luau-ast";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import ts from "typescript";

/**
 * Checks to see if the binding contains initializers and returns a new temporary identifier,
 * since they could mutate the binding variable.
 */
export function getTargetIdForBindingPattern(prereqs: Prereqs, name: ts.BindingPattern, value: luau.Expression) {
	return luau.isAnyIdentifier(value) &&
		name.elements.every(element => ts.isOmittedExpression(element) || !element.initializer)
		? value
		: prereqs.pushToVar(value, "binding");
}
