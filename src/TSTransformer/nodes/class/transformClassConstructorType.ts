import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import ts from "typescript";
import { transformType } from "../types/transformType";

export function transformImplicitClassConstructorType(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	name: luau.TypeIdentifier,
): luau.TypeFunction {
	const parameters = luau.list.make<luau.TypeParameter>();

	let hasDotDotDot = false;
	if (getExtendsNode(node)) {
		hasDotDotDot = true;
	}

	return luau.create(luau.SyntaxKind.TypeFunction, {
		parameters,
		dotDotDot: undefined,
		returnType: name,
	});
}

export function transformClassConstructorType(
	state: TransformState,
	node: ts.ConstructorDeclaration & { body: ts.Block },
	name: luau.TypeIdentifier,
): luau.TypeFunction {
	const parameters = luau.list.make<luau.TypeParameter>();

	for (const parameter of node.parameters) {
		if (ts.isParameterPropertyDeclaration(parameter, parameter.parent)) {
			luau.list.push(
				parameters,
				luau.create(luau.SyntaxKind.TypeParameter, {
					name: undefined,
					value: (parameter.type && transformType(state, state.getType(parameter), parameter)) ?? luau.any(),
				}),
			);
		}
	}

	return luau.create(luau.SyntaxKind.TypeFunction, {
		parameters,
		dotDotDot: undefined,
		returnType: name,
	});
}
