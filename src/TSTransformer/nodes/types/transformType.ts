import luau from "@roblox-ts/luau-ast";
import assert from "assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { isMethodFromType } from "TSTransformer/util/isMethod";
import { isDefinitelyType, isNumberType, isStringType } from "TSTransformer/util/types";
import ts from "typescript";

export function transformCallSignature(
	state: TransformState,
	type: ts.Type,
	reference: ts.Node,
	self?: luau.TypeIdentifier,
) {
	const signatures = type.getCallSignatures();
	assert(signatures.length > 0);

	let returnType: luau.TypeExpression | undefined = luau.any();
	let dotDotDot: luau.TypeExpression | undefined = undefined;
	let parameters = luau.list.make<luau.TypeParameter>();

	if (signatures.length === 1) {
		const call = signatures[0];
		if (isMethodFromType(state, reference, type)) {
			luau.list.push(
				parameters,
				luau.create(luau.SyntaxKind.TypeParameter, {
					name: "self",
					value: self ?? luau.any(),
				}),
			);
		}
		returnType = transformType(state, call.getReturnType(), reference) ?? luau.any();
		const parameterSymbols = call.getParameters();
		for (let i = 0; i < parameterSymbols.length; i++) {
			const parameter = call.getTypeParameterAtPosition(i);
			luau.list.push(
				parameters,
				luau.create(luau.SyntaxKind.TypeParameter, {
					name: parameterSymbols[i].getName(),
					value: transformType(state, parameter, reference) ?? luau.any(),
				}),
			);
		}
	}

	return luau.create(luau.SyntaxKind.TypeFunction, {
		dotDotDot,
		parameters,
		returnType,
	});
}

export function transformType(
	state: TransformState,
	type: ts.Type,
	reference: ts.Node,
): luau.TypeExpression | undefined {
	if (type.getCallSignatures().length > 0) {
		return transformCallSignature(state, type, reference);
	} else if (isDefinitelyType(type, isStringType)) {
		return luau.create(luau.SyntaxKind.TypeIdentifier, {
			module: undefined,
			name: "string",
		});
	} else if (isDefinitelyType(type, isNumberType)) {
		return luau.create(luau.SyntaxKind.TypeIdentifier, {
			module: undefined,
			name: "number",
		});
	}
}
