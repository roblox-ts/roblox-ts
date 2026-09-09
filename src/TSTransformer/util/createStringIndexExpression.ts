import luau from "@roblox-ts/luau-ast";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { EvaluationOperand, planEvaluation } from "TSTransformer/util/evaluation/plan";
import { getLiteralNumberValue } from "TSTransformer/util/getLiteralNumberValue";
import { offset } from "TSTransformer/util/offset";
import { isPossiblyType, isStringType } from "TSTransformer/util/types";
import ts from "typescript";

export function createStringIndexExpression(
	prereqs: Prereqs,
	expression: luau.Expression,
	indexOperand: EvaluationOperand,
	indexType: ts.Type,
) {
	const literalIndex = indexType.isStringLiteral()
		? Number(indexType.value)
		: getLiteralNumberValue(indexOperand.expression);

	return planEvaluation(
		prereqs,
		[{ expression, prereqs: luau.list.make() }, indexOperand],
		(indexPrereqs, [value, index]) => {
			if (literalIndex !== undefined) {
				if (!Number.isInteger(literalIndex) || literalIndex < 0) {
					return luau.nil();
				}
				index = luau.number(literalIndex);
			}

			const conditions = new Array<luau.Expression>();
			if (literalIndex === undefined) {
				// TypeScript also accepts numeric string keys such as "0"
				if (isPossiblyType(indexType, isStringType)) {
					index = indexPrereqs.pushToVar(luau.call(luau.id("tonumber"), [index]), "index");
					conditions.push(luau.binary(index, "~=", luau.nil()));
				}
				conditions.push(luau.binary(index, ">=", luau.number(0)));
				conditions.push(luau.binary(luau.binary(index, "%", luau.number(1)), "==", luau.number(0)));
			}
			conditions.push(luau.binary(index, "<", luau.unary("#", value)));

			// guard before string.sub so negative offsets and fractional indices cannot select a byte
			const at = offset(index, 1);
			return luau.create(luau.SyntaxKind.IfExpression, {
				condition: conditions.reduce((left, right) => luau.binary(left, "and", right)),
				expression: luau.call(luau.globals.string.sub, [value, at, at]),
				alternative: luau.nil(),
			});
		},
	);
}
