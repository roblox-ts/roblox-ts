import ts from "byots";
import * as tsst from "ts-simple-type";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";

export function walkTypes(type: ts.Type, callback: (type: ts.Type) => void) {
	if (type.isUnion() || type.isIntersection()) {
		for (const t of type.types) {
			walkTypes(t, callback);
		}
	} else {
		const constraint = type.getConstraint();
		if (constraint) {
			walkTypes(constraint, callback);
		} else {
			callback(type);
		}
	}
}

function typeConstraint(type: ts.Type, callback: (type: ts.Type) => boolean): boolean {
	if (type.isUnion()) {
		return type.types.every(t => typeConstraint(t, callback));
	} else if (type.isIntersection()) {
		return type.types.some(t => typeConstraint(t, callback));
	} else {
		return callback(type);
	}
}

export function isSomeType(type: ts.Type, cb: (type: ts.Type) => boolean) {
	if (typeConstraint(type, cb)) {
		return true;
	} else {
		const constraint = type.getConstraint();
		if (constraint && typeConstraint(constraint, cb)) {
			return true;
		}
	}
	return false;
}

export function isAnyType(type: ts.Type) {
	return isSomeType(type, t => !!(t.flags & ts.TypeFlags.Any));
}

export function isArrayType(state: TransformState, type: ts.Type) {
	return isSomeType(
		type,
		t =>
			state.typeChecker.isTupleType(t) ||
			state.typeChecker.isArrayLikeType(t) ||
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyArray) ||
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Array) ||
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadVoxelsArray) ||
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.TemplateStringsArray),
	);
}

export function isSetType(state: TransformState, type: ts.Type) {
	return isSomeType(
		type,
		t =>
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlySet) ||
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Set),
	);
}

export function isMapType(state: TransformState, type: ts.Type) {
	return isSomeType(
		type,
		t =>
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyMap) ||
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Map),
	);
}

export function isLuaTupleType(state: TransformState, type: ts.Type) {
	return type.aliasSymbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.LuaTuple);
}

export function isNumberType(type: ts.Type) {
	return isSomeType(
		type,
		t =>
			!!(t.flags & ts.TypeFlags.Number) ||
			!!(t.flags & ts.TypeFlags.NumberLike) ||
			!!(t.flags & ts.TypeFlags.NumberLiteral),
	);
}

export function isStringType(type: ts.Type) {
	return isSomeType(
		type,
		t =>
			!!(t.flags & ts.TypeFlags.String) ||
			!!(t.flags & ts.TypeFlags.StringLike) ||
			!!(t.flags & ts.TypeFlags.StringLiteral),
	);
}

export function isGeneratorType(state: TransformState, type: ts.Type) {
	return isSomeType(type, t => t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Generator));
}

export function isIterableFunctionType(state: TransformState, type: ts.Type) {
	return isSomeType(type, t => {
		if (t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.IterableFunction)) {
			return true;
		}

		// temporary?
		if (
			t.symbol.name === "FirstDecrementedIterableFunction" ||
			t.symbol.name === "DoubleDecrementedIterableFunction"
		) {
			return true;
		}

		return false;
	});
}

export function isIterableFunctionLuaTupleType(state: TransformState, type: ts.Type) {
	if (!isIterableFunctionType(state, type)) {
		return false;
	}

	// temporary?
	if (
		isSomeType(
			type,
			t =>
				t.symbol.name === "FirstDecrementedIterableFunction" ||
				t.symbol.name === "DoubleDecrementedIterableFunction",
		)
	) {
		return true;
	}

	const firstTypeArg: ts.Type | undefined = getTypeArguments(state, type)[0];
	return firstTypeArg !== undefined && isLuaTupleType(state, firstTypeArg);
}

export function isObjectType(type: ts.Type) {
	return isSomeType(type, t => !!(t.flags & ts.TypeFlags.Object));
}

export function getTypeArguments(state: TransformState, type: ts.Type) {
	return state.typeChecker.getTypeArguments(type as ts.TypeReference) ?? [];
}

const isAssignableToUndefined = (simpleType: tsst.SimpleType) =>
	tsst.isAssignableToSimpleTypeKind(simpleType, tsst.SimpleTypeKind.UNDEFINED) ||
	tsst.isAssignableToSimpleTypeKind(simpleType, tsst.SimpleTypeKind.VOID);
const isAssignableToFalse = (simpleType: tsst.SimpleType) => tsst.isAssignableToValue(simpleType, false);

/**
 * Uses ts-simple-type to check if a type is assignable to `undefined`
 */
export function canBeUndefined(state: TransformState, type: ts.Type) {
	const simpleType = state.getSimpleType(type);
	return isAssignableToUndefined(simpleType);
}

/**
 * Uses ts-simple-type to check if a type is assignable to `false` or `undefined`
 */
export function canTypeBeLuaFalsy(state: TransformState, type: ts.Type) {
	const simpleType = state.getSimpleType(type);
	return isAssignableToFalse(simpleType) || isAssignableToUndefined(simpleType);
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
	if (type.isUnion() || type.isIntersection()) {
		for (const t of type.types) {
			if (t.symbol && !state.typeChecker.isUndefinedSymbol(t.symbol)) {
				return t.symbol;
			}
		}
	} else {
		return type.symbol;
	}
}

export function isStringSimpleType(type: tsst.SimpleType) {
	return type.kind === tsst.SimpleTypeKind.STRING || type.kind === tsst.SimpleTypeKind.STRING_LITERAL;
}
