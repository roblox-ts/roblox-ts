import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import ts from "typescript";

export type MacroList<T> = { [index: string]: T };

export type IdentifierMacro = (state: TransformState, node: ts.Identifier) => luau.Expression;

export type ConstructorMacro = (state: TransformState, node: ts.NewExpression) => luau.Expression;

/**
 * Macros are plain functions of their operands. They embed the object expression and each
 * argument wherever the emitted Luau needs them, without regard to evaluation order: the
 * driver (`runCallMacro`) trial-runs the macro, observes how each operand is used, and
 * captures into a temporary any operand that would otherwise be re-evaluated or evaluated
 * out of TypeScript's order before running the macro for real.
 */
export type CallMacro = (
	state: TransformState,
	node: ts.CallExpression,
	expression: luau.Expression,
	args: Array<luau.Expression>,
) => luau.Expression;

export type PropertyCallMacro = (
	state: TransformState,
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression | ts.ElementAccessExpression },
	expression: luau.Expression,
	args: Array<luau.Expression>,
) => luau.Expression;
