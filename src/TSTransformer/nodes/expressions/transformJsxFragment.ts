import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformJsxChildren } from "TSTransformer/nodes/jsx/transformJsxChildren";
import { transformEntityName } from "TSTransformer/nodes/transformEntityName";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import ts from "typescript";

export function transformJsxFragment(state: TransformState, node: ts.JsxFragment) {
	const jsxFactoryEntity = state.resolver.getJsxFactoryEntity(node);
	assert(jsxFactoryEntity, "Expected jsxFactoryEntity to be defined");

	const jsxFragmentFactoryEntity = state.resolver.getJsxFragmentFactoryEntity(node);
	if (!jsxFragmentFactoryEntity) {
		DiagnosticService.addDiagnostic(errors.noJsxFragmentFactory(node));
		return luau.none();
	}

	const transformedChildren = transformJsxChildren(state, node.children);

	const args = [transformEntityName(state, jsxFragmentFactoryEntity)];

	if (transformedChildren.length > 0) {
		args.push(luau.nil());
	}

	args.push(...transformedChildren);

	return luau.call(convertToIndexableExpression(transformEntityName(state, jsxFactoryEntity)), args);
}
