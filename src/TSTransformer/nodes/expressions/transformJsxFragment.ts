import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformJsxChildren } from "TSTransformer/nodes/jsx/transformJsxChildren";
import { transformEntityName } from "TSTransformer/nodes/transformEntityName";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import ts from "typescript";

export function transformJsxFragment(state: TransformState, prereqs: Prereqs, node: ts.JsxFragment) {
	const jsxFactoryEntity = state.resolver.getJsxFactoryEntity(node);
	assert(jsxFactoryEntity, "Expected jsxFactoryEntity to be defined");

	const createElementExpression = convertToIndexableExpression(transformEntityName(state, jsxFactoryEntity));

	// getJsxFragmentFactoryEntity() doesn't seem to default to "Fragment"..
	// but the typechecker does, so we should follow that behavior
	const jsxFragmentFactoryEntity =
		state.resolver.getJsxFragmentFactoryEntity(node) ??
		ts.parseIsolatedEntityName("Fragment", ts.ScriptTarget.ESNext);
	assert(jsxFragmentFactoryEntity, "Unable to find valid jsxFragmentFactoryEntity");

	const args = [transformEntityName(state, jsxFragmentFactoryEntity)];

	const transformedChildren = transformJsxChildren(state, prereqs, node.children);

	// props parameter
	if (transformedChildren.length > 0) {
		args.push(luau.nil());
	}

	args.push(...transformedChildren);

	return luau.call(createElementExpression, args);
}
