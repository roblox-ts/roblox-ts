import { errors } from "Shared/diagnostics";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { adoptsNullableLuaTupleReturn } from "TSTransformer/util/adoptsNullableLuaTupleReturn";
import { skipDownwards } from "TSTransformer/util/traversal";
import { isLuaTupleType, isNullableLuaTupleType, walkTypes } from "TSTransformer/util/types";
import ts from "typescript";

function hasLuaTupleReturnWidening(
	state: TransformState,
	baseType: ts.Type,
	assignmentType: ts.Type,
	adoptsNullableReturn: boolean,
) {
	const adoptingType = adoptsNullableReturn ? state.typeChecker.getNonNullableType(baseType) : undefined;
	// collection macros expand at the call site instead of storing a function with a return convention
	const isMacroMethod = (type: ts.Type) =>
		type.symbol !== undefined &&
		type.getCallSignatures().length > 0 &&
		state.services.macroManager.getPropertyCallMacro(type.symbol) !== undefined;

	const visited = new Map<ts.Type, Set<ts.Type>>();
	function hasWidening(source: ts.Type, target: ts.Type): boolean {
		source = state.typeChecker.getNonNullableType(source.getConstraint() ?? source);
		target = state.typeChecker.getNonNullableType(target.getConstraint() ?? target);
		if (source === target || visited.get(source)?.has(target)) {
			return false;
		}

		// recursive callback containers can refer back to the same pair of types
		let targets = visited.get(source);
		if (!targets) {
			targets = new Set();
			visited.set(source, targets);
		}
		targets.add(target);

		let returnsTuple = false;
		walkTypes(source, type => {
			if (type === adoptingType || isMacroMethod(type)) {
				return;
			}
			returnsTuple ||= type
				.getCallSignatures()
				.some(signature => isLuaTupleType(state)(state.typeChecker.getReturnTypeOfSignature(signature)));
		});
		if (
			returnsTuple &&
			target
				.getCallSignatures()
				.some(signature => isNullableLuaTupleType(state)(state.typeChecker.getReturnTypeOfSignature(signature)))
		) {
			return true;
		}

		if (source.isUnion()) {
			return source.types.some(type => hasWidening(type, target));
		}
		if (target.isUnion()) {
			// compare only branches this value can inhabit, preserving discriminated containers
			return target.types.some(
				type => state.typeChecker.isTypeAssignableTo(source, type) && hasWidening(source, type),
			);
		}

		// returned callbacks keep their direction, while callers of the target pass arguments to the source
		for (const sourceSignature of source.getCallSignatures()) {
			for (const targetSignature of target.getCallSignatures()) {
				// generic signatures instantiate fresh types on each visit, so the visited pairs never repeat
				if (sourceSignature.typeParameters || targetSignature.typeParameters) {
					continue;
				}
				if (
					hasWidening(
						state.typeChecker.getReturnTypeOfSignature(sourceSignature),
						state.typeChecker.getReturnTypeOfSignature(targetSignature),
					)
				) {
					return true;
				}
				for (const [i, targetParameter] of targetSignature.parameters.entries()) {
					const sourceParameter = sourceSignature.parameters[i];
					if (
						sourceParameter &&
						hasWidening(
							state.typeChecker.getTypeOfSymbol(targetParameter),
							state.typeChecker.getTypeOfSymbol(sourceParameter),
						)
					) {
						return true;
					}
				}
			}
		}

		for (const property of source.getProperties()) {
			const sourceProperty = state.typeChecker.getTypeOfSymbol(property);
			if (isMacroMethod(sourceProperty)) {
				continue;
			}
			const targetProperty =
				state.typeChecker.getTypeOfPropertyOfType(target, property.name) ??
				(ts.isNumericLiteralName(property.name) ? target.getNumberIndexType() : undefined) ??
				target.getStringIndexType();
			if (targetProperty && hasWidening(sourceProperty, targetProperty)) {
				return true;
			}
		}

		for (const kind of [ts.IndexKind.String, ts.IndexKind.Number]) {
			const sourceIndex = state.typeChecker.getIndexTypeOfType(source, kind);
			const targetIndex = state.typeChecker.getIndexTypeOfType(target, kind);
			if (sourceIndex && targetIndex && hasWidening(sourceIndex, targetIndex)) {
				return true;
			}
		}
		return false;
	}

	return hasWidening(baseType, assignmentType);
}

export function validateLuaTupleReturnAssignment(
	state: TransformState,
	node: ts.Node,
	baseType: ts.Type,
	assignmentType: ts.Type,
) {
	const value = ts.isPropertyAssignment(node) ? node.initializer : node;
	const expression = ts.isExpression(value) ? skipDownwards(value) : value;
	// literal elements are validated against their own contextual types, reporting only the innermost value
	if (ts.isArrayLiteralExpression(expression) || ts.isObjectLiteralExpression(expression)) {
		return;
	}

	let hasWidening: boolean;
	if (adoptsNullableLuaTupleReturn(state, expression)) {
		// this function boxes its own return, but its parameters and returned callbacks are still checked
		hasWidening = hasLuaTupleReturnWidening(state, baseType, assignmentType, true);
	} else {
		// the same pair of types is commonly checked at many assignments
		const results = getOrSetDefault(
			state.multiTransformState.luaTupleReturnWideningCache,
			baseType,
			() => new Map(),
		);
		hasWidening = getOrSetDefault(results, assignmentType, () =>
			hasLuaTupleReturnWidening(state, baseType, assignmentType, false),
		);
	}
	if (hasWidening) {
		DiagnosticService.addDiagnosticWithCache(
			node,
			errors.noLuaTupleReturnWidening(node),
			state.multiTransformState.isReportedByNoLuaTupleReturnWidening,
		);
	}
}
