import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { skipUpwards } from "TSTransformer/util/traversal";
import { walkTypes } from "TSTransformer/util/types";
import ts from "typescript";

function isMethodDeclaration(node: ts.SignatureDeclaration | ts.JSDocSignature): boolean {
	if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
		return true;
	}

	// object literal function expressions have an implicit receiver
	return ts.isFunctionExpression(node) && ts.isPropertyAssignment(skipUpwards(node).parent);
}

function isMethodInner(state: TransformState, node: ts.Node, type: ts.Type) {
	let hasMethodDefinition = false;
	let hasCallbackDefinition = false;

	for (const callSignature of type.getCallSignatures()) {
		const thisParameter = callSignature.thisParameter;
		if (thisParameter) {
			const thisDeclaration = thisParameter.valueDeclaration;
			assert(thisDeclaration);
			// generic implementations keep the same receiver slot in every instantiation
			const thisType = state.getType(thisDeclaration);
			if (!(thisType.flags & ts.TypeFlags.Void)) {
				hasMethodDefinition = true;
			} else {
				hasCallbackDefinition = true;
			}
		} else if (callSignature.declaration) {
			if (isMethodDeclaration(callSignature.declaration)) {
				hasMethodDefinition = true;
			} else {
				hasCallbackDefinition = true;
			}
		}
	}

	if (hasMethodDefinition && hasCallbackDefinition) {
		DiagnosticService.addDiagnostic(errors.noMixedTypeCall(node));
	}

	return hasMethodDefinition;
}

export function isMethodFromType(state: TransformState, node: ts.Node, type: ts.Type) {
	let result = false;

	walkTypes(type, t => {
		if (t.symbol) {
			result ||= getOrSetDefault(state.multiTransformState.isMethodCache, t, () => isMethodInner(state, node, t));
		}
	});

	return result;
}

export function isMethod(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.SignatureDeclarationBase | ts.PropertyName,
): boolean {
	return isMethodFromType(state, node, state.getType(node));
}
