import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { getAddIterableToArrayBuilder } from "TSTransformer/util/getAddIterableToArrayBuilder";
import { isArrayType, isDefinitelyType, isPossiblyType, isUndefinedType } from "TSTransformer/util/types";
import ts from "typescript";

export function transformFunctionArguments(state: TransformState, args: ReadonlyArray<ts.Expression>) {
	const spreadCount = args.reduce((acc, cur) => (ts.isSpreadElement(cur) ? acc + 1 : acc), 0);
	// no spreads > just transform as list
	if (spreadCount === 0) return ensureTransformOrder(state, args);

	const lastArg = args[args.length - 1];
	if (
		// only one spread
		spreadCount === 1 &&
		// and the spread is the argument at the end
		ts.isSpreadElement(lastArg) &&
		// and it's an array
		isDefinitelyType(state.getType(lastArg.expression), isArrayType(state))
	) {
		// > use `unpack(item)`
		return ensureTransformOrder(state, args, (state, expression) =>
			ts.isSpreadElement(expression)
				? luau.call(luau.globals.unpack, [transformExpression(state, expression.expression)])
				: transformExpression(state, expression),
		);
	}

	// has multiple spreads, or a single spread which is an iterable
	const expressions = ensureTransformOrder(state, args, (state, expression) =>
		ts.isSpreadElement(expression)
			? transformExpression(state, expression.expression)
			: transformExpression(state, expression),
	);

	let firstSpread = 0;
	while (!ts.isSpreadElement(args[firstSpread])) {
		firstSpread++;
	}

	let lastSpread = args.length;
	do {
		lastSpread--;
	} while (!ts.isSpreadElement(args[lastSpread]));

	const arrayId = state.pushToVar(luau.array(), "array");
	const lengthId = state.pushToVar(luau.number(0), "length");
	for (let i = firstSpread; i < args.length; i++) {
		const shouldUpdateLengthId = i < lastSpread;
		const arg = args[i];
		if (ts.isSpreadElement(arg)) {
			const addIterableToArrayBuilder = getAddIterableToArrayBuilder(
				state,
				args[i],
				// ts.SpreadElement's type is the singular type, need to use .expression for the iterable type
				state.getType(arg.expression),
			);
			state.prereqList(
				addIterableToArrayBuilder(state, expressions[i], arrayId, lengthId, 0, shouldUpdateLengthId),
			);
		} else {
			state.prereq(
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.call(luau.globals.table.insert, [
						arrayId,
						luau.isCall(expressions[i]) && isPossiblyType(state.getType(arg), isUndefinedType)
							? luau.create(luau.SyntaxKind.ParenthesizedExpression, {
									expression: expressions[i],
							  })
							: expressions[i],
					]),
				}),
			);
			if (shouldUpdateLengthId) {
				state.prereq(
					luau.create(luau.SyntaxKind.Assignment, {
						left: lengthId,
						operator: "+=",
						right: luau.number(1),
					}),
				);
			}
		}
	}
	// replace [firstSpread..end] with an `unpack` of the array we built
	expressions.splice(firstSpread, expressions.length - firstSpread, luau.call(luau.globals.unpack, [arrayId]));
	return expressions;
}
