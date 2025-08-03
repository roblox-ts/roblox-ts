import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { isMethod } from "TSTransformer/util/isMethod";
import { isValidMethodIndexWithoutCall } from "TSTransformer/util/isValidMethodIndexWithoutCall";
import { skipUpwards } from "TSTransformer/util/traversal";
import { getFirstDefinedSymbol, isPossiblyType } from "TSTransformer/util/types";
import ts from "typescript";

export function addIndexDiagnostics(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.SignatureDeclarationBase | ts.PropertyName,
	expType: ts.Type,
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

	let expressionType: ts.Type | undefined;
	if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
		expressionType = state.getType(node.expression);
	}
	if (ts.isPropertyName(node)) {
		// node.parent.parent is bindingPattern
		if (ts.isBindingElement(node.parent)) {
			expressionType = state.getType(node.parent.parent);
		}

		// node.parent.parent.parent is binary exp within an assignment pattern
		if (ts.isPropertyAssignment(node.parent) || ts.isShorthandPropertyAssignment(node.parent)) {
			expressionType = state.getType(node.parent.parent.parent);
		}
	}

	if (!expressionType || !state.typeChecker.isTupleType(expressionType)) return;
	if (ts.isPropertyAccessExpression(node) && node.name.text === "length") {
		DiagnosticService.addDiagnostic(errors.noLengthIndexInTuples(node));
	}

	if (ts.isPropertyName(node) && node.getText() === "length") {
		DiagnosticService.addDiagnostic(errors.noLengthIndexInTuples(node));
	}

	if (ts.isElementAccessExpression(node)) {
		const argumentType = state.getType(node.argumentExpression);
		if (isPossiblyType(argumentType, type => type.isStringLiteral() && type.value === "length")) {
			DiagnosticService.addDiagnostic(errors.noLengthIndexInTuples(node));
		}
	}
}
