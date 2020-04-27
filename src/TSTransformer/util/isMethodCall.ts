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

function walkTypes(type: ts.Type, callback: (type: ts.Type) => void) {
	if (type.isUnion() || type.isIntersection()) {
		for (const t of type.types) {
			walkTypes(t, callback);
		}
	} else {
		callback(type);
	}
}

function isMethodCallInner(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
	type: ts.Type,
): boolean {
	let hasMethodDefinition = false;
	let hasCallbackDefinition = false;

	function checkMethod(node: ts.Node) {
		if (isMethodDeclaration(state, node)) {
			hasMethodDefinition = true;
		} else {
			hasCallbackDefinition = true;
		}
	}

	walkTypes(type, t => {
		if (t.symbol) {
			for (const declaration of t.symbol.declarations) {
				if (ts.isTypeLiteralNode(declaration)) {
					for (const callSignature of t.getCallSignatures()) {
						if (callSignature.declaration) {
							checkMethod(callSignature.declaration);
						}
					}
				} else {
					checkMethod(declaration);
				}
			}
		}
	});

	if (hasMethodDefinition && hasCallbackDefinition) {
		state.addDiagnostic(diagnostics.noMixedTypeCall(node));
	}

	return hasMethodDefinition;
}

const isMethodCallCache = new Map<ts.Symbol, boolean>();

export function isMethodCall(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): boolean {
	const type = state.typeChecker.getTypeAtLocation(node);
	return getOrDefault(isMethodCallCache, type.symbol, () => isMethodCallInner(state, node, type));
}
