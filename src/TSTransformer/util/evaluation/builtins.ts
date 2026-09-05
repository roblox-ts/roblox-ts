import luau from "@roblox-ts/luau-ast";
import path from "path";
import { RBXTS_SCOPE } from "Shared/constants";
import { assert } from "Shared/util/assert";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";
import { TransformState } from "TSTransformer";
import { NO_EFFECTS } from "TSTransformer/util/evaluation/effects";
import { markConstantReference, markStableLookup, setCallEffects } from "TSTransformer/util/evaluation/facts";
import { isDefinitelyType, isRobloxType } from "TSTransformer/util/types";
import ts from "typescript";

const LIBRARIES = new Set(["math", "string", "table", "bit32", "utf8", "coroutine", "task", "os", "debug", "buffer"]);
const PURE_MATH = new Set([
	"abs",
	"acos",
	"asin",
	"atan",
	"atan2",
	"ceil",
	"cos",
	"cosh",
	"deg",
	"exp",
	"floor",
	"fmod",
	"frexp",
	"ldexp",
	"log",
	"log10",
	"max",
	"min",
	"modf",
	"noise",
	"pow",
	"rad",
	"round",
	"sign",
	"sin",
	"sinh",
	"sqrt",
	"tan",
	"tanh",
]);

function isBuiltinDeclaration(state: TransformState, declaration: ts.Declaration) {
	return isPathDescendantOf(
		declaration.getSourceFile().fileName,
		path.join(state.data.nodeModulesPath, RBXTS_SCOPE, "types"),
	);
}

/** check declaration identity, not spelling: local lookalikes are ordinary tables. */
export function isBuiltinLibrary(state: TransformState, node: ts.Expression): node is ts.Identifier {
	if (!ts.isIdentifier(node) || !LIBRARIES.has(node.text)) {
		return false;
	}
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	assert(symbol);
	const declarations = symbol.declarations;
	assert(declarations);
	return (
		declarations.length > 0 && declarations.every(d => ts.isModuleDeclaration(d) && isBuiltinDeclaration(state, d))
	);
}

export function tryMarkBuiltinLibrary(state: TransformState, node: ts.Identifier, expression: luau.Expression) {
	if (isBuiltinLibrary(state, node)) {
		markConstantReference(expression);
	}
}

/** native methods are immutable even when calling them can mutate, throw or yield. */
export function isStableBuiltinMember(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
) {
	if (isBuiltinLibrary(state, node.expression)) {
		return true;
	}
	// optional-chain accesses run inside a nil guard; getNonOptionalType alone
	// does not remove a real T | undefined union from the original expression
	const lookupType = (expression: ts.Expression) =>
		ts.isOptionalChain(node)
			? state.typeChecker.getNonNullableType(state.getType(expression))
			: state.typeChecker.getNonOptionalType(state.getType(expression));
	const type = lookupType(node.expression);
	if (!isDefinitelyType(type, isRobloxType(state))) {
		return false;
	}
	const declarations = lookupType(node).symbol?.declarations;
	return !!declarations?.length && declarations.every(d => ts.isMethodSignature(d) && isBuiltinDeclaration(state, d));
}

export function tryMarkBuiltinMember(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
	expression: luau.Expression,
) {
	if (!isStableBuiltinMember(state, node)) {
		return;
	}
	markStableLookup(expression);
	// these numeric functions are inert for their statically checked arguments.
	// clamp can throw even for numbers; random/randomseed mutate RNG state.
	if (isBuiltinLibrary(state, node.expression) && node.expression.text === "math") {
		const name = ts.isPropertyAccessExpression(node)
			? node.name.text
			: ts.isStringLiteral(node.argumentExpression)
				? node.argumentExpression.text
				: undefined;
		const call = node.parent;
		const nonemptyArguments =
			ts.isCallExpression(call) &&
			call.expression === node &&
			call.arguments.length > 0 &&
			!ts.isSpreadElement(call.arguments[0]);
		if ((name === "min" || name === "max") && !nonemptyArguments) {
			// the types permit empty varargs, which throw. A function value must
			// retain that possibility until an actual call supplies an argument.
			setCallEffects(expression, { ...NO_EFFECTS, throws: true });
		} else if (name !== undefined && PURE_MATH.has(name)) {
			setCallEffects(expression, NO_EFFECTS);
		} else if (name === "clamp") {
			setCallEffects(expression, { ...NO_EFFECTS, throws: true });
		}
	}
}
