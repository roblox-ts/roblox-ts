import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { effectsCommute, getEffects } from "TSTransformer/util/evaluation/effects";
import { substitute } from "TSTransformer/util/evaluation/substitute";
import ts from "typescript";

export function transformBindingPattern(
	state: TransformState,
	prereqs: Prereqs,
	pattern: ts.BindingPattern,
	value: luau.Expression,
) {
	const reference = luau.tempId("binding");
	const body = new Prereqs();
	if (ts.isArrayBindingPattern(pattern)) {
		transformArrayBindingPattern(state, body, pattern, reference);
	} else {
		transformObjectBindingPattern(state, body, pattern, reference);
	}

	// capture only when the emitted destructuring can change the source binding
	const source =
		luau.isAnyIdentifier(value) && effectsCommute(getEffects(value), getEffects(body.statements))
			? value
			: prereqs.pushToVar(value, "binding");
	const replacements = new Map([[reference.id, source]]);
	prereqs.pushList(
		luau.list.make(...luau.list.toArray(body.statements).map(statement => substitute(statement, replacements))),
	);
}
