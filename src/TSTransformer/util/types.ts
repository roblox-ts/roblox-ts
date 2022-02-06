import { errors } from "Shared/diagnostics";
import { ROACT_SYMBOL_NAMES, SYMBOL_NAMES, TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { NOMINAL_LUA_TUPLE_NAME } from "TSTransformer/classes/MacroManager";
import { isTemplateLiteralType } from "TSTransformer/typeGuards";
import { arrayCount } from "TSTransformer/util/arrayCount";
import ts from "typescript";

type TypeCheck = (type: ts.Type) => boolean;

function getRecursiveBaseTypesInner(result: Array<ts.Type>, type: ts.InterfaceType) {
	for (const baseType of type.getBaseTypes() ?? []) {
		result.push(baseType);
		if (baseType.isClassOrInterface()) {
			getRecursiveBaseTypesInner(result, baseType);
		}
	}
}

function getRecursiveBaseTypes(type: ts.InterfaceType) {
	const result = new Array<ts.Type>();
	getRecursiveBaseTypesInner(result, type);
	return result;
}

function isDefinitelyTypeInner(
	state: TransformState,
	type: ts.Type,
	callbacks: Array<TypeCheck>,
	requireFullMatchNode?: ts.Node,
): boolean {
	if (type.isUnion()) {
		const numberOfFits = arrayCount(type.types, t =>
			isDefinitelyTypeInner(state, t, callbacks, requireFullMatchNode),
		);
		// In a union, either *all* or *none* of the types should match
		if (requireFullMatchNode && numberOfFits !== 0 && numberOfFits !== type.types.length) {
			DiagnosticService.addDiagnosticFromNodeIfNotCached(
				state,
				requireFullMatchNode,
				errors.noMixedTypes(requireFullMatchNode),
				state.multiTransformState.isReportedByNoMultiCache,
			);
		}
		return numberOfFits === type.types.length;
	} else if (type.isIntersection()) {
		return type.types.some(t => isDefinitelyTypeInner(state, t, callbacks, requireFullMatchNode));
	} else {
		if (requireFullMatchNode && isAnyType(type.checker)(type)) {
			// `any` means the type does not definitely fit.
			// However, we return true here,
			// because some exhaustive type checks will assertion crash
			// if they do not match any of the specific cases.
			// For example, `getAddIterableToArrayBuilder`.
			// Since a diagnostic is reported,
			// it won't matter that the emitted code is wrong
			DiagnosticService.addDiagnosticFromNodeIfNotCached(
				state,
				requireFullMatchNode,
				errors.noAny(requireFullMatchNode),
				state.multiTransformState.isReportedByNoAnyCache,
			);
			return true;
		} else if (
			type.isClassOrInterface() &&
			getRecursiveBaseTypes(type).some(t => isDefinitelyTypeInner(state, t, callbacks, requireFullMatchNode))
		) {
			return true;
		}
		return callbacks.some(cb => cb(type));
	}
}

/** Returns true if the type definitely fits *at least one* of the provided callbacks */
export function isDefinitelyType(
	state: TransformState,
	type: ts.Type,
	requireFullMatchNode?: ts.Node,
	...callbacks: Array<TypeCheck>
) {
	return isDefinitelyTypeInner(state, type.getConstraint() ?? type, callbacks, requireFullMatchNode);
}

export function isOneOfArrayDefinitelyType(
	state: TransformState,
	types: Array<ts.Type>,
	requireFullMatchNode?: Array<ts.Node>,
	...callbacks: Array<TypeCheck>
) {
	if (!requireFullMatchNode) {
		// If no node to check `any` types on
		// then just make sure at least one of the types matches one of the callbacks
		return types.some(t => isDefinitelyTypeInner(state, t, callbacks, requireFullMatchNode));
	}
	// For any checks:
	// With an array, *at least one* of the types must match *at least one* of the callbacks
	// If this is not the case, *and* at least one of the types is `any`, report the error
	// Intentionally omit the recursive `requireFullMatchNode` here in case one of the types matches
	// In which case we don't want the noAny diagnostic to be reported
	const numberOfFits = arrayCount(types, t => isDefinitelyTypeInner(state, t, callbacks));
	if (numberOfFits === 0) {
		// None of the types matched, so run with `requireFullMatchNode` to report possible noAny
		types.forEach((t, i) => isDefinitelyTypeInner(state, t, callbacks, requireFullMatchNode[i]));
	}
	return numberOfFits > 0;
}

function isPossiblyTypeInner(type: ts.Type, callbacks: Array<TypeCheck>): boolean {
	if (type.isUnionOrIntersection()) {
		return type.types.some(t => isPossiblyTypeInner(t, callbacks));
	} else {
		if (type.isClassOrInterface() && getRecursiveBaseTypes(type).some(t => isPossiblyTypeInner(t, callbacks))) {
			return true;
		}

		// type variable without constraint, any, or unknown
		if (!!(type.flags & (ts.TypeFlags.TypeVariable | ts.TypeFlags.AnyOrUnknown))) {
			return true;
		} else if (isAnyType(type.checker)) {
			return true;
		} else if (isDefinedType(type)) {
			if (callbacks.length === 1 && callbacks[0] === isUndefinedType) {
				// if only matching undefined, then defined means not possible
				return false;
			}
			return true;
		}

		return callbacks.some(cb => cb(type));
	}
}

/** Returns true if the type possibly fits *at least one* of the provided callbacks */
export function isPossiblyType(type: ts.Type, ...callbacks: Array<TypeCheck>) {
	return isPossiblyTypeInner(type.getConstraint() ?? type, callbacks);
}

export function isDefinedType(type: ts.Type) {
	return (
		type.flags === ts.TypeFlags.Object &&
		type.getProperties().length === 0 &&
		type.getCallSignatures().length === 0 &&
		type.getConstructSignatures().length === 0 &&
		type.getNumberIndexType() === undefined &&
		type.getStringIndexType() === undefined
	);
}

export function isAnyType(checker: ts.TypeChecker): TypeCheck {
	return type => type === checker.getAnyType();
}

export function isBooleanType(type: ts.Type) {
	return !!(type.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral));
}

export function isBooleanLiteralType(state: TransformState, value: boolean): TypeCheck {
	return type => {
		if (!!(type.flags & ts.TypeFlags.BooleanLiteral)) {
			const valueType = value ? state.typeChecker.getTrueType() : state.typeChecker.getFalseType();
			return type === valueType;
		}
		return isBooleanType(type);
	};
}

export function isNumberType(type: ts.Type) {
	return !!(type.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLike | ts.TypeFlags.NumberLiteral));
}

export function isNumberLiteralType(value: number): TypeCheck {
	return type => {
		if (type.isNumberLiteral()) {
			return type.value === value;
		}
		return isNumberType(type);
	};
}

export function isNaNType(type: ts.Type) {
	return isNumberType(type) && !type.isNumberLiteral();
}

export function isStringType(type: ts.Type) {
	return !!(type.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLike | ts.TypeFlags.StringLiteral));
}

export function isArrayType(state: TransformState): TypeCheck {
	return type =>
		state.typeChecker.isTupleType(type) ||
		state.typeChecker.isArrayLikeType(type) ||
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyArray) ||
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Array) ||
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadVoxelsArray) ||
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.TemplateStringsArray);
}

export function isSetType(state: TransformState): TypeCheck {
	return type =>
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Set) ||
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlySet) ||
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.WeakSet);
}

export function isMapType(state: TransformState): TypeCheck {
	return type =>
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Map) ||
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyMap) ||
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.WeakMap);
}

export function isGeneratorType(state: TransformState): TypeCheck {
	return type => type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Generator);
}

export function isIterableFunctionType(state: TransformState): TypeCheck {
	return type => type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.IterableFunction);
}

export function isLuaTupleType(state: TransformState): TypeCheck {
	return type =>
		type.getProperty(NOMINAL_LUA_TUPLE_NAME) ===
		state.services.macroManager.getSymbolOrThrow(NOMINAL_LUA_TUPLE_NAME);
}

export function isIterableFunctionLuaTupleType(state: TransformState): TypeCheck {
	return type => {
		if (isIterableFunctionType(state)(type)) {
			const firstTypeArg: ts.Type | undefined = getTypeArguments(state, type)[0];
			return firstTypeArg !== undefined && isLuaTupleType(state)(firstTypeArg);
		}
		return false;
	};
}

export function isIterableType(state: TransformState): TypeCheck {
	return type => type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Iterable);
}

export function isObjectType(type: ts.Type) {
	return !!(type.flags & ts.TypeFlags.Object);
}

export function isUndefinedType(type: ts.Type) {
	return !!(type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void));
}

export function isEmptyStringType(type: ts.Type) {
	if (type.isStringLiteral()) {
		return type.value === "";
	}
	if (isTemplateLiteralType(type)) {
		return type.texts.length === 0 || type.texts.every(v => v.length === 0);
	}
	return isStringType(type);
}

export function isRoactElementType(state: TransformState): TypeCheck {
	return type => {
		const symbol = state.services.roactSymbolManager?.getSymbolOrThrow(ROACT_SYMBOL_NAMES.Element);
		return symbol !== undefined && type.symbol === symbol;
	};
}

// type utilities

export function walkTypes(type: ts.Type, callback: (type: ts.Type) => void) {
	if (type.isUnionOrIntersection()) {
		for (const t of type.types) {
			walkTypes(t, callback);
		}
	} else {
		// in template literal types, constraint === type and this causes infinite recursion
		const constraint = type.getConstraint();
		if (constraint && constraint !== type) {
			walkTypes(constraint, callback);
		} else {
			callback(type);
		}
	}
}

export function getFirstConstructSymbol(state: TransformState, expression: ts.Expression) {
	const type = state.getType(expression);
	if (type.symbol) {
		const declarations = type.symbol.getDeclarations();
		if (declarations) {
			for (const declaration of declarations) {
				if (ts.isInterfaceDeclaration(declaration)) {
					for (const member of declaration.members) {
						if (ts.isConstructSignatureDeclaration(member)) {
							return member.symbol;
						}
					}
				}
			}
		}
	}
}

export function getFirstDefinedSymbol(state: TransformState, type: ts.Type) {
	if (type.isUnionOrIntersection()) {
		for (const t of type.types) {
			if (t.symbol && !state.typeChecker.isUndefinedSymbol(t.symbol)) {
				return t.symbol;
			}
		}
	} else {
		return type.symbol;
	}
}

export function getTypeArguments(state: TransformState, type: ts.Type) {
	return state.typeChecker.getTypeArguments(type as ts.TypeReference) ?? [];
}
