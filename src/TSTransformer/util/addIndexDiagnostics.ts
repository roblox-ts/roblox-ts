import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { isMethod } from "TSTransformer/util/isMethod";
import { isValidMethodIndexWithoutCall } from "TSTransformer/util/isValidMethodIndexWithoutCall";
import { skipUpwards } from "TSTransformer/util/traversal";
import { getFirstDefinedSymbol, isPossiblyType } from "TSTransformer/util/types";
import ts from "typescript";

function isPossiblyTupleType(state: TransformState, type: ts.Type): boolean {
	const constraint = type.getConstraint();
	if (constraint && constraint !== type) {
		return isPossiblyTupleType(state, constraint);
	}

	if (type.isUnionOrIntersection()) {
		return type.types.some(t => isPossiblyTupleType(state, t));
	}

	return state.typeChecker.isTupleType(type);
}

function isLengthPropertyName(state: TransformState, node: ts.PropertyName): boolean {
	if (ts.isComputedPropertyName(node)) {
		const argumentType = state.getType(node.expression);
		return isPossiblyType(argumentType, type => type.isStringLiteral() && type.value === "length");
	}

	return (ts.isIdentifier(node) || ts.isStringLiteral(node)) && node.text === "length";
}

export function addIndexDiagnostics(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.SignatureDeclarationBase | ts.PropertyName,
	expType: ts.Type,
	expressionType?: ts.Type,
) {
	const symbol = getFirstDefinedSymbol(state, expType);
	if (
		(symbol && state.services.macroManager.getPropertyCallMacro(symbol)) ||
		(!isValidMethodIndexWithoutCall(state, skipUpwards(node)) && isMethod(state, node))
	) {
		DiagnosticService.addDiagnostic(errors.noIndexWithoutCall(node));
	}

	if (ts.isPrototypeAccess(node)) {
		DiagnosticService.addDiagnostic(errors.noPrototype(node));
	}

	if (!expressionType && (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))) {
		expressionType = state.getType(node.expression);
	}

	if (!expressionType || !isPossiblyTupleType(state, expressionType)) return;
	if (ts.isPropertyAccessExpression(node) && node.name.text === "length") {
		DiagnosticService.addDiagnostic(errors.noLengthIndexInTuples(node));
	}

	if (ts.isPropertyName(node) && isLengthPropertyName(state, node)) {
		DiagnosticService.addDiagnostic(errors.noLengthIndexInTuples(node));
	}

	if (ts.isElementAccessExpression(node)) {
		const argumentType = state.getType(node.argumentExpression);
		if (isPossiblyType(argumentType, type => type.isStringLiteral() && type.value === "length")) {
			DiagnosticService.addDiagnostic(errors.noLengthIndexInTuples(node));
		}
	}
}
