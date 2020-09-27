import ts from "byots";
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

function isTypeInner(type: ts.Type, callback: (type: ts.Type) => boolean): boolean {
	if (type.isUnion()) {
		return type.types.every(t => isTypeInner(t, callback));
	} else if (type.isIntersection()) {
		return type.types.some(t => isTypeInner(t, callback));
	} else {
		return callback(type);
	}
}

export function isType(type: ts.Type, cb: (type: ts.Type) => boolean) {
	return isTypeInner(type.getConstraint() ?? type, cb);
}

function isPossiblyTypeInner(type: ts.Type, callback: (type: ts.Type) => boolean): boolean {
	if (type.isUnion()) {
		return type.types.some(t => isPossiblyTypeInner(t, callback));
	} else if (type.isIntersection()) {
		return type.types.some(t => isPossiblyTypeInner(t, callback));
	} else {
		// type variable without constraint, any, or unknown
		if (!!(type.flags & (ts.TypeFlags.TypeVariable | ts.TypeFlags.AnyOrUnknown))) {
			return true;
		}

		// defined type
		if (!!(type.flags & ts.TypeFlags.Object) && type.getProperties().length === 0) {
			return true;
		}

		return callback(type);
	}
}

export function isPossiblyType(type: ts.Type, cb: (type: ts.Type) => boolean) {
	return isPossiblyTypeInner(type.getConstraint() ?? type, cb);
}

export function isAnyType(type: ts.Type) {
	return isType(type, t => !!(t.flags & ts.TypeFlags.Any));
}

export function isArrayType(state: TransformState, type: ts.Type) {
	return isType(
		type,
		t =>
			state.typeChecker.isTupleType(t) ||
			state.typeChecker.isArrayLikeType(t) ||
			t.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyArray) ||
			t.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Array) ||
			t.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadVoxelsArray) ||
			t.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.TemplateStringsArray),
	);
}

export function isSetType(state: TransformState, type: ts.Type) {
	return isType(
		type,
		t =>
			t.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlySet) ||
			t.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Set),
	);
}

export function isMapType(state: TransformState, type: ts.Type) {
	return isType(
		type,
		t =>
			t.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyMap) ||
			t.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Map),
	);
}

export function isLuaTupleType(state: TransformState, type: ts.Type) {
	return type.aliasSymbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.LuaTuple);
}

export function isNumberType(type: ts.Type) {
	return isType(
		type,
		t =>
			!!(t.flags & ts.TypeFlags.Number) ||
			!!(t.flags & ts.TypeFlags.NumberLike) ||
			!!(t.flags & ts.TypeFlags.NumberLiteral),
	);
}

export function isStringType(type: ts.Type) {
	return isType(
		type,
		t =>
			!!(t.flags & ts.TypeFlags.String) ||
			!!(t.flags & ts.TypeFlags.StringLike) ||
			!!(t.flags & ts.TypeFlags.StringLiteral),
	);
}

export function isGeneratorType(state: TransformState, type: ts.Type) {
	return isType(type, t => t.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Generator));
}

export function isIterableFunctionType(state: TransformState, type: ts.Type) {
	return isType(type, t => {
		if (t.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.IterableFunction)) {
			return true;
		}

		// temporary?
		if (
			t.symbol &&
			(t.symbol.name === "FirstDecrementedIterableFunction" ||
				t.symbol.name === "DoubleDecrementedIterableFunction")
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
		isType(
			type,
			t =>
				t.symbol &&
				(t.symbol.name === "FirstDecrementedIterableFunction" ||
					t.symbol.name === "DoubleDecrementedIterableFunction"),
		)
	) {
		return true;
	}

	const firstTypeArg: ts.Type | undefined = getTypeArguments(state, type)[0];
	return firstTypeArg !== undefined && isLuaTupleType(state, firstTypeArg);
}

export function isObjectType(type: ts.Type) {
	return isType(type, t => !!(t.flags & ts.TypeFlags.Object));
}

export function getTypeArguments(state: TransformState, type: ts.Type) {
	return state.typeChecker.getTypeArguments(type as ts.TypeReference) ?? [];
}

export function isPossiblyFalse(state: TransformState, type: ts.Type) {
	return isPossiblyType(type, t => {
		if (!!(t.flags & ts.TypeFlags.BooleanLiteral)) {
			return t === state.typeChecker.getFalseType();
		}
		return !!(t.flags & ts.TypeFlags.Boolean);
	});
}

export function isPossiblyUndefined(type: ts.Type) {
	return isPossiblyType(type, t => !!(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)));
}

export function isPossiblyZero(type: ts.Type) {
	return isPossiblyType(type, t => {
		if (t.isNumberLiteral()) {
			return t.value === 0;
		}
		return isNumberType(t);
	});
}

export function isPossiblyNaN(type: ts.Type) {
	return isPossiblyType(type, t => isNumberType(t) && !t.isNumberLiteral());
}

export function isPossiblyEmptyString(type: ts.Type) {
	return isPossiblyType(type, t => {
		if (t.isStringLiteral()) {
			return t.value === "";
		}
		return isStringType(t);
	});
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
