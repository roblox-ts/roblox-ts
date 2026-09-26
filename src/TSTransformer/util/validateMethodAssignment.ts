import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { isMethod, isMethodFromType } from "TSTransformer/util/isMethod";
import { isValidMethodIndexWithoutCall } from "TSTransformer/util/isValidMethodIndexWithoutCall";
import { skipDownwards, skipUpwards } from "TSTransformer/util/traversal";
import { walkTypes } from "TSTransformer/util/types";
import ts from "typescript";

function hasCallSignatures(type: ts.Type) {
	let hasCallSignatures = false;
	walkTypes(type, t => {
		hasCallSignatures ||= t.getCallSignatures().length > 0;
	});
	return hasCallSignatures;
}

function isZeroParameterFunction(state: TransformState, node: ts.Node) {
	if (ts.isPropertyAssignment(node)) {
		node = skipDownwards(node.initializer);
	}

	if (ts.isIdentifier(node) || ts.isShorthandPropertyAssignment(node)) {
		const symbol = ts.isShorthandPropertyAssignment(node)
			? state.typeChecker.getShorthandAssignmentValueSymbol(node)
			: state.typeChecker.getSymbolAtLocation(node);
		assert(symbol);
		const declaration = symbol.valueDeclaration;

		if (declaration && ts.isVariableDeclaration(declaration)) {
			if (!(declaration.parent.flags & ts.NodeFlags.Const) || !declaration.initializer) {
				return false;
			}

			node = skipDownwards(declaration.initializer);
		} else {
			// overload signatures can hide optional or rest parameters in the implementation
			const implementation = symbol.declarations?.find(
				declaration => ts.isFunctionDeclaration(declaration) && declaration.body !== undefined,
			);
			if (!implementation) {
				return false;
			}

			node = implementation;
		}
	}

	return (
		(ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) &&
		node.parameters.every(parameter => ts.isThisIdentifier(parameter.name)) &&
		!isMethod(state, node)
	);
}

function validateTypes(state: TransformState, node: ts.Node, baseType: ts.Type, assignmentType: ts.Type) {
	if (hasCallSignatures(baseType) && hasCallSignatures(assignmentType)) {
		const assignmentIsMethod = isMethodFromType(state, node, assignmentType);
		if (isMethodFromType(state, node, baseType) !== assignmentIsMethod) {
			if (assignmentIsMethod) {
				// zero-parameter functions without a receiver ignore the extra receiver argument
				if (isZeroParameterFunction(state, node)) {
					return;
				}

				DiagnosticService.addDiagnostic(errors.expectedMethodGotFunction(node));
			} else {
				DiagnosticService.addDiagnostic(errors.expectedFunctionGotMethod(node));
			}
		}
	}
}

export function validateMethodExpression(state: TransformState, node: ts.Expression, type: ts.Type) {
	const parent = skipUpwards(node).parent;
	// object literal members are checked together with their contextual property types
	if (ts.isPropertyAssignment(parent) || ts.isShorthandPropertyAssignment(parent) || !hasCallSignatures(type)) {
		return;
	}

	const contextualType = state.typeChecker.getContextualType(node);
	if (contextualType && contextualType !== type) {
		const expression = skipDownwards(node);
		// method extraction already reports why this value cannot be used as a callback
		if (
			(ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) &&
			!isValidMethodIndexWithoutCall(state, skipUpwards(node)) &&
			isMethodFromType(state, node, type)
		) {
			return;
		}

		validateTypes(state, expression, type, contextualType);
	}
}

function validateObjectLiteralElement(state: TransformState, node: ts.ObjectLiteralElementLike) {
	const type = state.getType(node);
	const contextualType = state.typeChecker.getContextualTypeForObjectLiteralElement(node);
	if (contextualType && contextualType !== type) {
		validateTypes(state, node, type, contextualType);
	}
}

function validateHeritageClause(state: TransformState, node: ts.ClassElement, typeNode: ts.TypeNode) {
	const name = ts.getPropertyNameForPropertyNameNode(node.name!);
	if (!name) return;

	const type = state.getType(node);
	const propertyType = state.typeChecker.getTypeOfPropertyOfType(state.getType(typeNode), name);
	if (!propertyType) return;

	validateTypes(state, node, type, propertyType);
}

function validateSpread(state: TransformState, node: ts.SpreadAssignment) {
	const type = state.getType(node.expression);
	const contextualType = state.typeChecker.getContextualType(node.expression);
	if (!contextualType) return;

	for (const property of type.getProperties()) {
		const basePropertyType = state.typeChecker.getTypeOfPropertyOfType(type, property.name);
		const assignmentPropertyType = state.typeChecker.getTypeOfPropertyOfType(contextualType, property.name);
		if (!basePropertyType) continue;
		if (!assignmentPropertyType) continue;

		validateTypes(state, node, basePropertyType, assignmentPropertyType);
	}
}

export function validateMethodAssignment(state: TransformState, node: ts.ObjectLiteralElementLike | ts.ClassElement) {
	if (ts.isClassElement(node) && ts.isClassLike(node.parent) && node.name) {
		for (const typeNode of ts.getAllSuperTypeNodes(node.parent)) {
			validateHeritageClause(state, node, typeNode);
		}
	} else if (ts.isObjectLiteralElementLike(node)) {
		if (ts.isSpreadAssignment(node)) {
			if (!ts.isObjectLiteralExpression(node.expression)) {
				validateSpread(state, node);
			}
		} else {
			validateObjectLiteralElement(state, node);
		}
	}
}
