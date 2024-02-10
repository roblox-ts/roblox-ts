import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformJsxChildren } from "TSTransformer/nodes/jsx/transformJsxChildren";
import { transformEntityName } from "TSTransformer/nodes/transformEntityName";
import ts from "typescript";

export function transformJsxFragment(state: TransformState, node: ts.JsxFragment) {
	const jsxFactoryEntity = state.resolver.getJsxFactoryEntity(node);
	assert(jsxFactoryEntity, "Expected jsxFactoryEntity to be defined");

	const jsxFragmentFactoryEntity = state.resolver.getJsxFragmentFactoryEntity(node);
	if (!jsxFragmentFactoryEntity) {
		DiagnosticService.addDiagnostic(errors.noJsxFragmentFactory(node));
		return luau.none();
	}

	return luau.call(transformEntityName(state, jsxFactoryEntity), [
		transformEntityName(state, jsxFragmentFactoryEntity),
		luau.map(),
		...transformJsxChildren(state, node.children),
	]);
}
