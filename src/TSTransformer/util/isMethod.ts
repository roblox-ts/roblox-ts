import ts from "byots";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { diagnostics } from "TSTransformer/diagnostics";

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
	if (ts.isFunctionLike(node)) {
		const thisParam = getThisParameter(node.parameters);
		if (thisParam) {
			return !(state.getType(thisParam).flags & ts.TypeFlags.Void);
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

function isMethodInner(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.SignatureDeclarationBase,
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

function getDefinedType(state: TransformState, type: ts.Type) {
	if (type.isUnion()) {
		for (const subType of type.types) {
			if (subType.symbol && !state.typeChecker.isUndefinedSymbol(subType.symbol)) {
				return subType;
			}
		}
	} else {
		return type;
	}
}

export function isMethod(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.SignatureDeclarationBase,
): boolean {
	const type = getDefinedType(state, state.getType(node));
	if (!type || !type.symbol) {
		return false;
	}
	return getOrSetDefault(state.compileState.isMethodCache, type.symbol, () => isMethodInner(state, node, type));
}
