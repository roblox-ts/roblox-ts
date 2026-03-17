import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { PropertyCallMacro } from "TSTransformer/macros/types";
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
 */
export function resolveInput(
	state: TransformState,
	expression: luau.Expression,
	input: MacroInput,
): luau.Expression {
	switch (input.usage) {
		case "once":
			return expression;
		case "read":
			return state.pushToVarIfComplex(expression, input.name);
		case "callable":
			return state.pushToVarIfNonId(expression, input.name);
		case "write":
			return state.pushToVar(expression, input.name);
	}
}

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
	emit: PropertyCallMacro;
}

/**
 * Creates a PropertyCallMacro from a declarative definition.
 *
 * Inputs are automatically resolved to the minimum set of temporary
 * variables before the emit function is called. The resolution strategy
 * for each input is determined by its declared usage:
 *
 * - `once`:     Inline as-is (no temp)
 * - `read`:     Temp only if expression is complex (not a simple primitive or identifier)
 * - `callable`: Temp only if expression is not already an identifier
 * - `write`:    Always creates a temp variable
 *
 * @example
 * ```ts
 * filter: defineMacro({
 *     expression: read("exp"),
 *     args: [callable("callback")],
 *     emit: (state, node, expression, args) => {
 *         // expression is guaranteed simple (identifier or temp)
 *         // args[0] is guaranteed an identifier (original or temp)
 *         const resultId = state.pushToVar(luau.array(), "result");
 *         // ... emit loop using expression and args[0] directly
 *         return resultId;
 *     },
 * }),
 * ```
 */
export function defineMacro(def: MacroDefinition): PropertyCallMacro {
	return (
		state: TransformState,
		node: ts.CallExpression & { expression: ts.PropertyAccessExpression | ts.ElementAccessExpression },
		expression: luau.Expression,
		args: Array<luau.Expression>,
	) => {
		if (def.expression) {
			expression = resolveInput(state, expression, def.expression);
		}
		if (def.args) {
			for (let i = 0; i < args.length && i < def.args.length; i++) {
				args[i] = resolveInput(state, args[i], def.args[i]);
			}
		}
		return def.emit(state, node, expression, args);
	};
}
