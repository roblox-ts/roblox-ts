import ts from "byots";
import { diagnostics } from "Shared/diagnostics";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { walkTypes } from "TSTransformer/util/types";

function getThisParameter(parameters: ts.NodeArray<ts.ParameterDeclaration>) {
	const firstParam = parameters[0];
	if (firstParam) {
		const name = firstParam.name;
		if (ts.isIdentifier(name) && ts.isThisIdentifier(name)) {
			return name;
		}
	}
}

function isMethodDeclaration(state: TransformState, node: ts.Node): boolean {
	if (ts.isFunctionLike(node) && !ts.isFunctionDeclaration(node)) {
		const thisParam = getThisParameter(node.parameters);
		if (thisParam) {
			return !(state.getType(thisParam).flags & ts.TypeFlags.Void);
		} else {
			return ts.isMethodDeclaration(node) || ts.isMethodSignature(node);
		}
	}
	return false;
}

function isMethodInner(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.SignatureDeclarationBase,
	type: ts.Type,
): boolean {
	let hasMethodDefinition = false;
	let hasCallbackDefinition = false;

	const declarations = type.symbol.getDeclarations();
	if (declarations) {
		for (const declaration of declarations) {
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
	}

	if (hasMethodDefinition && hasCallbackDefinition) {
		state.addDiagnostic(diagnostics.noMixedTypeCall(node));
	}

	return hasMethodDefinition;
}

export function isMethod(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.SignatureDeclarationBase,
): boolean {
	let result = false;

	walkTypes(state.getType(node), t => {
		if (t.symbol) {
			result =
				result ||
				getOrSetDefault(state.multiTransformState.isMethodCache, t.symbol, () => isMethodInner(state, node, t));
		}
	});

	return result;
}
