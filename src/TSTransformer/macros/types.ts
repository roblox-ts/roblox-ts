import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import ts from "typescript";

export type MacroList<T> = { [index: string]: T };

export type IdentifierMacro = (state: TransformState, node: ts.Identifier) => luau.Expression;

export type ConstructorMacro = (state: TransformState, node: ts.NewExpression) => luau.Expression;

/**
 * Declares what a macro does between (or after) uses of the operands it receives, so that
 * the driver (`runCallMacro`) can stabilize the operands *before* the macro runs. Macro
 * transform bodies never need to reason about evaluation order themselves.
 *
 * - "none": the macro lowers to a single Luau expression that embeds the object and each
 *   argument at most once, in operand order, and emits no prerequisite statements.
 *   Operands are passed through raw. (Enforced by a validator when running tests.)
 * - "heap": the macro may emit statements that read/write through tables, but never runs
 *   user code. Operands survive raw only if re-evaluating them across heap writes is
 *   unobservable (identifiers, literals, temporaries, arithmetic on them); everything
 *   else is captured into a temporary, in operand order.
 * - "user": the macro may invoke user code (callbacks) between operand uses. Only
 *   operands with no dependencies at all survive raw (literals, temporaries, const
 *   bindings); everything else is captured.
 *
 * The class may be computed per call site (e.g. `sort` only runs user code when a
 * comparator is present).
 */
export type MacroEffects = "none" | "heap" | "user";

export type CallMacroTransform = (
	state: TransformState,
	node: ts.CallExpression,
	expression: luau.Expression,
	args: Array<luau.Expression>,
) => luau.Expression;

export interface CallMacro {
	effects: MacroEffects | ((state: TransformState, node: ts.CallExpression) => MacroEffects);
	transform: CallMacroTransform;
}

export type PropertyCallMacroTransform = (
	state: TransformState,
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression | ts.ElementAccessExpression },
	expression: luau.Expression,
	args: Array<luau.Expression>,
) => luau.Expression;

export interface PropertyCallMacro {
	effects: MacroEffects | ((state: TransformState, node: ts.CallExpression) => MacroEffects);
	transform: PropertyCallMacroTransform;
}
