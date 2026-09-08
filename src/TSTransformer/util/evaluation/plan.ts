import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import {
	canDiscard,
	canRepeat,
	effectsCommute,
	getEffects,
	joinEffects,
	NO_EFFECTS,
} from "TSTransformer/util/evaluation/effects";
import { EvaluationReference, getEvaluationEvents } from "TSTransformer/util/evaluation/events";
import { copyValueFacts } from "TSTransformer/util/evaluation/facts";
import { offset } from "TSTransformer/util/offset";
import { wrapExpressionStatement } from "TSTransformer/util/wrapExpressionStatement";

export interface EvaluationOperand {
	readonly expression: luau.Expression;
	readonly prereqs: luau.List<luau.Statement>;
}

function substitute<T extends luau.Node>(node: T, replacements: ReadonlyMap<number, luau.Expression>): T {
	if (luau.isTemporaryIdentifier(node)) {
		const replacement = replacements.get(node.id);
		if (replacement) {
			return { ...replacement, parent: undefined } as T;
		}
	}
	const fields: Record<string | symbol, unknown> = { ...node };
	delete fields.parent;
	for (const [key, value] of Object.entries(fields)) {
		if (luau.isNode(value)) {
			fields[key] = substitute(value, replacements);
		} else if (luau.list.isList(value)) {
			fields[key] = luau.list.make(...luau.list.toArray(value).map(child => substitute(child, replacements)));
		}
	}
	const updated = luau.create(node.kind, fields as never) as T;
	// substitution can turn an indexable reference into a call/literal/conditional.
	if (luau.isPropertyAccessExpression(updated) || luau.isComputedIndexExpression(updated) || luau.isCall(updated)) {
		updated.expression = convertToIndexableExpression(updated.expression as luau.Expression);
	}
	// recover arithmetic folding which was intentionally hidden behind references.
	if (
		luau.isBinaryExpression(updated) &&
		(updated.operator === "+" || updated.operator === "-") &&
		luau.isNumberLiteral(updated.right)
	) {
		return offset(updated.left, Number(updated.right.value) * (updated.operator === "-" ? -1 : 1)) as T;
	}
	return updated;
}

// opaque references prevent macros from decomposing or duplicating an operand's
// computation before we decide where its value must be captured
export function planEvaluation(
	state: TransformState,
	operands: ReadonlyArray<EvaluationOperand>,
	expand: (references: Array<luau.Expression>) => luau.Expression,
) {
	const effects = operands.map(operand => getEffects(operand.expression));
	const slots = new Map<number, EvaluationReference>();
	const references = operands.map(({ expression }, index) => {
		// literal inspection (typeIs, default arguments, index folding) is harmless.
		if (luau.isSimplePrimitive(expression) || luau.isNone(expression)) {
			return expression;
		}
		const reference = luau.tempId("operand");
		copyValueFacts(expression, reference);
		slots.set(reference.id, { operandIndex: index, expression, effects: effects[index] });
		return reference;
	});
	const [result, statements] = state.capture(() => expand(references));
	const events = getEvaluationEvents(statements, result, slots);

	const uses = operands.map(() => new Array<number>());
	events.forEach((event, index) => {
		if (event.operandIndex !== undefined) {
			uses[event.operandIndex].push(index);
		}
	});
	const captures = operands.map(() => false);
	let hoistedEffects = NO_EFFECTS;
	for (let i = operands.length - 1; i >= 0; i--) {
		const positions = uses[i];
		let interveningEffects = hoistedEffects;
		// earlier operands are checked on subsequent iterations; captured later
		// operands already contribute their effects at the hoisted position
		const last = positions[positions.length - 1] ?? -1;
		const uncertain = positions.some(position => events[position].conditional);
		for (let j = 0; j < events.length; j++) {
			const event = events[j];
			if (event.operandIndex !== undefined && (event.operandIndex <= i || captures[event.operandIndex])) {
				continue;
			}
			if (j < last || uncertain) {
				interveningEffects = joinEffects(interveningEffects, event.effects);
			}
		}
		captures[i] =
			positions.length === 0
				? !canDiscard(effects[i])
				: ((positions.length > 1 || uncertain) && !canRepeat(effects[i])) ||
					!effectsCommute(effects[i], interveningEffects);
		if (captures[i]) {
			hoistedEffects = joinEffects(effects[i], hoistedEffects);
		}
		hoistedEffects = joinEffects(getEffects(operands[i].prereqs), hoistedEffects);
	}

	const replacements = new Map<number, luau.Expression>();
	for (let i = 0; i < operands.length; i++) {
		state.prereqList(operands[i].prereqs);
		let expression = operands[i].expression;
		if (captures[i]) {
			if (uses[i].length === 0) {
				state.prereqList(wrapExpressionStatement(expression));
			} else {
				const captured = state.pushToVar(expression, i === 0 ? "exp" : `arg${i - 1}`);
				// working temporaries may change value; only immutable captures inherit these facts
				copyValueFacts(expression, captured);
				expression = captured;
			}
		}
		const reference = references[i];
		if (luau.isTemporaryIdentifier(reference) && slots.has(reference.id)) {
			replacements.set(reference.id, expression);
		}
	}

	state.prereqList(
		luau.list.make(...luau.list.toArray(statements).map(statement => substitute(statement, replacements))),
	);
	return substitute(result, replacements);
}
