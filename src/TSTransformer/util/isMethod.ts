import { errors } from "Shared/diagnostics";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { skipUpwards } from "TSTransformer/util/traversal";
import { getTypeArguments, walkTypes } from "TSTransformer/util/types";
import ts from "typescript";

function containsInstantiableType(type: ts.Type): boolean {
	if (type.isUnionOrIntersection()) {
		return type.types.some(containsInstantiableType);
	}
	return !!(type.flags & ts.TypeFlags.Instantiable);
}

function canChangeReceiverConvention(state: TransformState, type: ts.Type) {
	if (!containsInstantiableType(type)) {
		return false;
	}

	// a fixed non-void union member keeps the instantiated union from becoming void
	if (
		type.isUnion() &&
		type.types.some(t => !(t.flags & (ts.TypeFlags.Void | ts.TypeFlags.Never)) && !containsInstantiableType(t))
	) {
		return false;
	}

	if (type.flags & ts.TypeFlags.Conditional) {
		const conditionalType = type as ts.ConditionalType;
		const { root } = conditionalType;
		let checkType = root.checkType;
		let extendsType = conditionalType.extendsType;
		// singleton tuples suppress distribution without changing the void test
		if (state.typeChecker.isTupleType(checkType) && state.typeChecker.isTupleType(extendsType)) {
			const checkElements = getTypeArguments(state, checkType);
			const extendsElements = getTypeArguments(state, extendsType);
			if (checkElements.length === 1 && extendsElements.length === 1) {
				checkType = checkElements[0];
				extendsType = extendsElements[0];
			}
		}

		// a conditional that removes void can still have an unconstrained fallback type
		if (
			state.typeChecker.getTypeFromTypeNode(root.node.trueType).flags & ts.TypeFlags.Never &&
			state.typeChecker.getTypeFromTypeNode(root.node.falseType) === checkType &&
			state.typeChecker.isTypeAssignableTo(state.typeChecker.getVoidType(), extendsType)
		) {
			return false;
		}
	}

	const constraint = state.typeChecker.getBaseConstraintOfType(type);
	return !constraint || state.typeChecker.isTypeAssignableTo(state.typeChecker.getVoidType(), constraint);
}

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
			const thisType = state.typeChecker.getTypeOfSymbolAtLocation(thisParameter, node);
			if (canChangeReceiverConvention(state, thisType)) {
				DiagnosticService.addDiagnosticWithCache(
					node,
					errors.noUnstableThisType(node),
					state.multiTransformState.isReportedByNoUnstableThisType,
				);
			}
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
