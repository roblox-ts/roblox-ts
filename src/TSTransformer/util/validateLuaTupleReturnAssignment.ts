import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { isLuaTupleType, isNullableLuaTupleType, walkTypes } from "TSTransformer/util/types";
import ts from "typescript";

export function validateLuaTupleReturnAssignment(
	state: TransformState,
	node: ts.Node,
	baseType: ts.Type,
	assignmentType: ts.Type,
) {
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
			// collection macros expand at the call site instead of storing a function with a return convention
			if (type.symbol && state.services.macroManager.getPropertyCallMacro(type.symbol)) {
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

		for (const property of source.getProperties()) {
			const targetProperty =
				state.typeChecker.getTypeOfPropertyOfType(target, property.name) ??
				(ts.isNumericLiteralName(property.name) ? target.getNumberIndexType() : undefined) ??
				target.getStringIndexType();
			if (
				targetProperty &&
				hasWidening(state.typeChecker.getTypeOfSymbolAtLocation(property, node), targetProperty)
			) {
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

	if (hasWidening(baseType, assignmentType)) {
		DiagnosticService.addDiagnosticWithCache(
			node,
			errors.noLuaTupleReturnWidening(node),
			state.multiTransformState.isReportedByNoLuaTupleReturnWidening,
		);
	}
}
