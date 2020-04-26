import { TransformState } from "TSTransformer";
import ts from "typescript";
import { diagnostics } from "TSTransformer/diagnostics";
import { getOrDefault } from "Shared/util/getOrDefault";

function hasTypeFlag(flags: ts.TypeFlags, flagToCheck: ts.TypeFlags) {
	return (flags & flagToCheck) === flagToCheck;
}

function getThisParameter(parameters: ts.NodeArray<ts.ParameterDeclaration>) {
	const firstParam = parameters[0];
	if (firstParam) {
		const name = firstParam.name;
		if (ts.isIdentifier(name) && name.text === "this") {
			return name;
		}
	}
}

function isMethodDeclaration(state: TransformState, node: ts.Node): boolean {
	if (ts.isFunctionLike(node)) {
		const thisParam = getThisParameter(node.parameters);
		if (thisParam) {
			const thisType = state.typeChecker.getTypeAtLocation(thisParam);
			return !hasTypeFlag(thisType.flags, ts.TypeFlags.Void);
		} else {
			return ts.isMethodDeclaration(node) || ts.isMethodSignature(node);
		}
	}

	return false;
}

function isMethodCallInner(
	state: TransformState,
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression },
	type: ts.Type,
): boolean {
	let hasMethodDefinition = false;
	let hasCallbackDefinition = false;

	for (const declaration of type.symbol.declarations) {
		if (ts.isTypeLiteralNode(declaration)) {
			for (const callSignature of type.getCallSignatures()) {
				if (callSignature.declaration) {
					if (isMethodDeclaration(state, callSignature.declaration)) {
						hasMethodDefinition = true;
					} else {
						hasCallbackDefinition = true;
					}
				}
			}
		} else {
			if (isMethodDeclaration(state, declaration)) {
				hasMethodDefinition = true;
			} else {
				hasCallbackDefinition = true;
			}
		}
	}

	if (hasMethodDefinition && hasCallbackDefinition) {
		state.addDiagnostic(diagnostics.mixedTypeCall(node));
	}

	return hasMethodDefinition;
}

const isMethodCallCache = new Map<ts.Symbol, boolean>();

export function isMethodCall(
	state: TransformState,
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression },
): boolean {
	const type = state.typeChecker.getTypeAtLocation(node.expression);
	return getOrDefault(isMethodCallCache, type.symbol, () => isMethodCallInner(state, node, type));
}
