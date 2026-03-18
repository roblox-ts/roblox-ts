import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { expressionMightMutate } from "TSTransformer/util/expressionMightMutate";
import ts from "typescript";

/**
 * Describes how a macro input is used, determining whether
 * a temporary variable is needed in the emitted Luau.
 *
 * - `"once"`:     Used at most once. No temporary created.
 * - `"read"`:     Read multiple times. Temporary only if expression is complex.
 * - `"callable"`: Called as a function. Temporary only if not already an identifier.
 * - `"write"`:    Written to / assigned. Always creates a temporary variable.
 */
export type InputUsage = "once" | "read" | "callable" | "write";

/**
 * Describes a macro input with its usage pattern and preferred variable name.
 */
export interface MacroInput {
	usage: InputUsage;
	name?: string;
}

// Shorthand constructors for concise macro definitions

/** Input used at most once - no temporary needed */
export const once = (name?: string): MacroInput => ({ usage: "once", name });

/** Input read multiple times - temporary only if complex expression */
export const read = (name?: string): MacroInput => ({ usage: "read", name });

/** Input called as function - temporary only if not already an identifier */
export const callable = (name?: string): MacroInput => ({ usage: "callable", name });

/** Input written to - always creates a temporary variable */
export const write = (name?: string): MacroInput => ({ usage: "write", name });

/**
 * Resolves a macro input expression based on its declared usage,
 * creating the minimum necessary temporary variables.
 *
 * When a TS node is provided, `expressionMightMutate` is used to skip
 * temp creation for provably immutable expressions (const identifiers,
 * literals, compiler-generated temps).
 */
export function resolveInput(
	state: TransformState,
	expression: luau.Expression,
	input: MacroInput,
	tsNode?: ts.Expression,
): luau.Expression {
	switch (input.usage) {
		case "once":
			return expression;
		case "read":
			if (tsNode && !expressionMightMutate(state, expression, tsNode)) {
				return expression;
			}
			return state.pushToVarIfComplex(expression, input.name);
		case "callable":
			if (tsNode && !expressionMightMutate(state, expression, tsNode)) {
				return expression;
			}
			return state.pushToVarIfNonId(expression, input.name);
		case "write":
			return state.pushToVar(expression, input.name);
	}
}

/**
 * The emit function type for defineMacro. After input resolution:
 * - expression is IndexableExpression (identifier, temp, or simple value)
 * - args remain as Expression (use convertToIndexableExpression for callable args)
 */
export type MacroEmitFn = (
	state: TransformState,
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression | ts.ElementAccessExpression },
	expression: luau.IndexableExpression,
	args: Array<luau.Expression>,
) => luau.Expression;

/**
 * Declarative macro definition. Describes how inputs are used so the
 * framework can produce the minimum set of temporary variables.
 */
export interface MacroDefinition {
	/** How the receiver/base expression is used */
	expression?: MacroInput;
	/** How each positional argument is used (by index) */
	args?: Array<MacroInput>;
	/** The macro implementation, receiving pre-resolved inputs */
	emit: MacroEmitFn;
}

/**
 * WeakSet tracking macros produced by `defineMacro`. These macros handle
 * their own input resolution via declared usage patterns, so `runCallMacro`
 * can skip its blanket temporary-variable loop for them.
 */
export const managedMacros = new WeakSet<object>();

/**
 * Creates a PropertyCallMacro from a declarative definition.
 *
 * Inputs are automatically resolved to the minimum set of temporary
 * variables before the emit function is called. Resolution uses both
 * the declared usage pattern AND `expressionMightMutate` analysis:
 *
 * - `once`:     Inline as-is (no temp). The macro promises to use it
 *               at most once, in order, before emitting any prereqs.
 * - `read`:     Skipped if provably immutable (const identifier, literal,
 *               compiler temp). Otherwise temp only if expression is complex.
 * - `callable`: Skipped if provably immutable. Otherwise temp only if
 *               expression is not already an identifier.
 * - `write`:    Always creates a temp variable.
 *
 * Because `defineMacro` macros declare their usage, `runCallMacro` skips
 * its blanket temporary-variable loop (which would conservatively temp ALL
 * mutable args). This avoids unnecessary temps for `once`-declared inputs
 * and lets `expressionMightMutate` skip temps for immutable expressions.
 *
 * The resolved expression is guaranteed to be IndexableExpression (since
 * read/callable/write all produce identifiers, temps, or simple values).
 * Resolved callable args should be narrowed with convertToIndexableExpression()
 * when used as the function target in luau.call().
 *
 * @example
 * ```ts
 * filter: defineMacro({
 *     expression: read("exp"),
 *     args: [callable("callback")],
 *     emit: (state, node, expression, args) => {
 *         // expression is IndexableExpression (identifier or temp)
 *         // args[0] is an identifier - use convertToIndexableExpression for luau.call
 *         const resultId = state.pushToVar(luau.array(), "result");
 *         // ... emit loop
 *         return resultId;
 *     },
 * }),
 * ```
 */
export function defineMacro(def: MacroDefinition): (
	state: TransformState,
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression | ts.ElementAccessExpression },
	expression: luau.Expression,
	args: Array<luau.Expression>,
) => luau.Expression {
	const fn = (
		state: TransformState,
		node: ts.CallExpression & { expression: ts.PropertyAccessExpression | ts.ElementAccessExpression },
		expression: luau.Expression,
		args: Array<luau.Expression>,
	) => {
		// Extract TS nodes for expressionMightMutate analysis
		const tsExpression = node.expression.expression;
		const tsArgs = node.arguments;

		if (def.expression) {
			expression = resolveInput(state, expression, def.expression, tsExpression);
		}
		if (def.args) {
			for (let i = 0; i < args.length && i < def.args.length; i++) {
				args[i] = resolveInput(state, args[i], def.args[i], tsArgs[i]);
			}
		}
		// After resolution with read/callable/write, expression is always
		// an identifier or simple value - guaranteed to be indexable
		return def.emit(state, node, convertToIndexableExpression(expression), args);
	};
	managedMacros.add(fn);
	return fn;
}
