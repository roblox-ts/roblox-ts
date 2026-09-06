import luau from "@roblox-ts/luau-ast";
import type { EvaluationEffects } from "TSTransformer/util/evaluation/effects";
import ts from "typescript";

export interface BindingKey {
	readonly captured: boolean;
	readonly writtenByClosure: boolean;
}
export type Binding = BindingKey | string | number | symbol;

// symbol-keyed facts survive luau.create's shallow cloning without colliding with AST fields
const BINDING = Symbol("binding");
const CONSTANT = Symbol("constant");
const BUILTIN = Symbol("builtin");
const PRIMITIVE = Symbol("primitive value");
const CALL_EFFECTS = Symbol("effects when called");
const STABLE_LOOKUP = Symbol("stable member lookup");
type Annotated = luau.Node & {
	[BINDING]?: Binding;
	[CONSTANT]?: boolean;
	[BUILTIN]?: EvaluationEffects;
	[PRIMITIVE]?: boolean;
	[CALL_EFFECTS]?: EvaluationEffects;
	[STABLE_LOOKUP]?: boolean;
};

export function markConstantReference(expression: luau.Expression) {
	(expression as Annotated)[CONSTANT] = true;
}

/** the lookup is inert; evaluating the receiver and invoking the member are not. */
export function markStableLookup(expression: luau.Expression) {
	(expression as Annotated)[STABLE_LOOKUP] = true;
}

export function markPrimitiveValue(expression: luau.Expression) {
	(expression as Annotated)[PRIMITIVE] = true;
}

export function copyValueFacts(from: luau.Expression, to: luau.Expression) {
	if ((from as Annotated)[PRIMITIVE]) {
		markPrimitiveValue(to);
	}
	const effects = (from as Annotated)[CALL_EFFECTS];
	if (effects) {
		(to as Annotated)[CALL_EFFECTS] = effects;
	}
}

export function setCallEffects(expression: luau.Expression, effects: EvaluationEffects) {
	(expression as Annotated)[CALL_EFFECTS] = effects;
}

export function getCallEffects(expression: luau.Expression) {
	return (expression as Annotated)[CALL_EFFECTS];
}

export function isConstantReference(node: luau.Node) {
	return !!(node as Annotated)[CONSTANT];
}

export function isPrimitiveValue(node: luau.Expression): boolean {
	if ((node as Annotated)[PRIMITIVE] || luau.isSimplePrimitive(node)) {
		return true;
	}
	if (luau.isParenthesizedExpression(node)) {
		return isPrimitiveValue(node.expression);
	}
	return false;
}

export function markBinding(identifier: luau.AnyIdentifier, symbol: ts.Symbol, key: BindingKey) {
	(identifier as Annotated)[BINDING] = key;
	const declaration = symbol.valueDeclaration;
	if (
		symbol.declarations?.some(
			d =>
				ts.isImportSpecifier(d) ||
				ts.isImportClause(d) ||
				ts.isNamespaceImport(d) ||
				ts.isImportEqualsDeclaration(d),
		)
	) {
		markConstantReference(identifier);
	}
	if (declaration && ts.isFunctionDeclaration(declaration)) {
		(identifier as Annotated)[CONSTANT] = true;
	}
	let parent: ts.Node | undefined = declaration;
	while (
		parent &&
		(ts.isBindingElement(parent) || ts.isObjectBindingPattern(parent) || ts.isArrayBindingPattern(parent))
	) {
		parent = parent.parent;
	}
	if (parent && ts.isVariableDeclaration(parent) && ts.isVariableDeclarationList(parent.parent)) {
		(identifier as Annotated)[CONSTANT] = !!(parent.parent.flags & ts.NodeFlags.Const);
	}
}

export function getBinding(identifier: luau.AnyIdentifier): Binding {
	return (
		(identifier as Annotated)[BINDING] ?? (luau.isTemporaryIdentifier(identifier) ? identifier.id : identifier.name)
	);
}

export function markBuiltinReference(expression: luau.Expression, effects: EvaluationEffects) {
	(expression as Annotated)[CONSTANT] = true;
	(expression as Annotated)[BUILTIN] = effects;
}

export function getBuiltinCallEffects(expression: luau.Expression) {
	return (expression as Annotated)[BUILTIN];
}

export function isStableLookup(expression: luau.Expression) {
	return !!(expression as Annotated)[STABLE_LOOKUP];
}
