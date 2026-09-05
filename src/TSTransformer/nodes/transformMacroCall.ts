import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { CallMacro, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { EvaluationOperand, planEvaluation } from "TSTransformer/util/evaluation/plan";
import { isPossiblyType, isUndefinedType } from "TSTransformer/util/types";
import { wrapReturnIfLuaTuple } from "TSTransformer/util/wrapReturnIfLuaTuple";
import ts from "typescript";

export function transformMacroCall(
	macro: CallMacro | PropertyCallMacro,
	state: TransformState,
	node: ts.CallExpression,
	expression: luau.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
): luau.Expression {
	const operands: Array<EvaluationOperand> = [{ expression, prereqs: luau.list.make() }];
	for (const argument of nodeArguments) {
		let [value, prereqs] = state.capture(() => transformExpression(state, argument));
		if (!ts.isSpreadElement(argument)) {
			// scalar arguments must supply one nil even when an inlined call returns no values
			if (luau.isCall(value) && isPossiblyType(state.getType(argument), isUndefinedType)) {
				value = luau.create(luau.SyntaxKind.ParenthesizedExpression, { expression: value });
			}
			operands.push({ expression: value, prereqs });
			continue;
		}
		const signature = state.typeChecker.getResolvedSignature(node);
		const parameter = signature?.parameters[signature.parameters.length - 1]?.valueDeclaration;
		if (parameter && ts.isParameter(parameter) && parameter.dotDotDotToken) {
			DiagnosticService.addDiagnostic(errors.noVarArgsMacroSpread(argument));
			return luau.none();
		}
		const type = state.getType(argument.expression);
		assert(state.typeChecker.isTupleType(type));
		const count = (type as ts.TupleTypeReference).target.elementFlags.length;
		const ids = Array.from({ length: count }, (_, i) => luau.tempId(`spread${i}`));
		if (ids.length === 0) {
			// an empty spread may still have effects
			luau.list.push(
				prereqs,
				luau.create(luau.SyntaxKind.VariableDeclaration, { left: luau.tempId(), right: value }),
			);
			operands.push({ expression: luau.none(), prereqs });
		} else {
			luau.list.push(
				prereqs,
				luau.create(luau.SyntaxKind.VariableDeclaration, { left: luau.list.make(...ids), right: value }),
			);
			ids.forEach((id, i) => operands.push({ expression: id, prereqs: i === 0 ? prereqs : luau.list.make() }));
		}
	}
	const result = planEvaluation(state, operands, ([receiver, ...args]) =>
		macro(
			state,
			node as Parameters<PropertyCallMacro>[1],
			receiver,
			args.filter(arg => !luau.isNone(arg)),
		),
	);
	return wrapReturnIfLuaTuple(state, node, result);
}
