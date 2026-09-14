import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { CallMacro, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { EvaluationOperand, planEvaluation } from "TSTransformer/util/evaluation/plan";
import { isPossiblyType, isUndefinedType } from "TSTransformer/util/types";
import { wrapReturnIfLuaTuple } from "TSTransformer/util/wrapReturnIfLuaTuple";
import ts from "typescript";

export function transformMacroCall(
	macro: CallMacro | PropertyCallMacro,
	state: TransformState,
	prereqs: Prereqs,
	node: ts.CallExpression,
	expression: luau.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
): luau.Expression {
	const operands: Array<EvaluationOperand> = [{ expression, prereqs: luau.list.make() }];
	for (const argument of nodeArguments) {
		const valuePrereqs = new Prereqs();
		let value = transformExpression(state, valuePrereqs, argument);
		if (!ts.isSpreadElement(argument)) {
			// scalar arguments must supply one nil even when an inlined call returns no values
			if (luau.isCall(value) && isPossiblyType(state.getType(argument), isUndefinedType)) {
				value = luau.create(luau.SyntaxKind.ParenthesizedExpression, { expression: value });
			}
			operands.push({ expression: value, prereqs: valuePrereqs.statements });
			continue;
		}
		const signature = state.typeChecker.getResolvedSignature(node);
		assert(signature);
		const parameter = signature.parameters[signature.parameters.length - 1]?.valueDeclaration;
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
			valuePrereqs.push(luau.create(luau.SyntaxKind.VariableDeclaration, { left: luau.tempId(), right: value }));
			operands.push({ expression: luau.none(), prereqs: valuePrereqs.statements });
		} else {
			valuePrereqs.push(
				luau.create(luau.SyntaxKind.VariableDeclaration, { left: luau.list.make(...ids), right: value }),
			);
			ids.forEach((id, i) =>
				operands.push({ expression: id, prereqs: i === 0 ? valuePrereqs.statements : luau.list.make() }),
			);
		}
	}
	const result = planEvaluation(prereqs, operands, (expansionPrereqs, [receiver, ...args]) =>
		macro(
			state,
			expansionPrereqs,
			node as Parameters<PropertyCallMacro>[2],
			receiver,
			args.filter(arg => !luau.isNone(arg)),
		),
	);
	return wrapReturnIfLuaTuple(state, node, result);
}
