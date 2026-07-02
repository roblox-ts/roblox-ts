import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "typescript";

/**
 * Checks to see if the binding contains initializers and returns a new temporary identifier,
 * since they could mutate the binding variable.
 */
export function getTargetIdForBindingPattern(state: TransformState, name: ts.BindingPattern, value: luau.Expression) {
	return luau.isAnyIdentifier(value) &&
		name.elements.every(element => ts.isOmittedExpression(element) || !element.initializer)
		? value
		: state.pushToVar(value, "binding");
}
