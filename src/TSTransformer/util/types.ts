import ts from "byots";
import { ROACT_SYMBOL_NAMES, SYMBOL_NAMES, TransformState } from "TSTransformer";

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

function isDefinitelyTypeInner(type: ts.Type, callback: (type: ts.Type) => boolean): boolean {
	if (type.isUnion()) {
		return type.types.every(t => isDefinitelyTypeInner(t, callback));
	} else if (type.isIntersection()) {
		return type.types.some(t => isDefinitelyTypeInner(t, callback));
	} else {
		if (type.isClassOrInterface() && getRecursiveBaseTypes(type).some(t => isDefinitelyTypeInner(t, callback))) {
			return true;
		}
		return callback(type);
	}
}

export function isDefinitelyType(type: ts.Type, cb: (type: ts.Type) => boolean) {
	return isDefinitelyTypeInner(type.getConstraint() ?? type, cb);
}

function isPossiblyTypeInner(type: ts.Type, callback: (type: ts.Type) => boolean): boolean {
	if (type.isUnionOrIntersection()) {
		return type.types.some(t => isPossiblyTypeInner(t, callback));
	} else {
		if (type.isClassOrInterface() && getRecursiveBaseTypes(type).some(t => isPossiblyTypeInner(t, callback))) {
			return true;
		}

		// type variable without constraint, any, or unknown
		if (!!(type.flags & (ts.TypeFlags.TypeVariable | ts.TypeFlags.AnyOrUnknown))) {
			return true;
		}

		// defined type
		if (isObjectType(type) && type.getProperties().length === 0) {
			return true;
		}

		return callback(type);
	}
}

export function isPossiblyType(type: ts.Type, cb: (type: ts.Type) => boolean) {
	return isPossiblyTypeInner(type.getConstraint() ?? type, cb);
}

export function isAnyType(type: ts.Type) {
	return !!(type.flags & ts.TypeFlags.Any);
}

export function isBooleanType(type: ts.Type) {
	return !!(type.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral));
}

export function isBooleanLiteralType(state: TransformState, type: ts.Type, value: boolean) {
	if (!!(type.flags & ts.TypeFlags.BooleanLiteral)) {
		const valueType = value ? state.typeChecker.getTrueType() : state.typeChecker.getFalseType();
		return type === valueType;
	}
	return isBooleanType(type);
}

export function isNumberType(type: ts.Type) {
	return !!(type.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLike | ts.TypeFlags.NumberLiteral));
}

export function isNumberLiteralType(type: ts.Type, value: number) {
	if (type.isNumberLiteral()) {
		return type.value === value;
	}
	return isNumberType(type);
}

export function isNaNType(type: ts.Type) {
	return isNumberType(type) && !type.isNumberLiteral();
}

export function isStringType(type: ts.Type) {
	return !!(type.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLike | ts.TypeFlags.StringLiteral));
}

export function isArrayType(state: TransformState, type: ts.Type) {
	return (
		state.typeChecker.isTupleType(type) ||
		state.typeChecker.isArrayLikeType(type) ||
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyArray) ||
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Array) ||
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadVoxelsArray) ||
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.TemplateStringsArray)
	);
}

export function isSetType(state: TransformState, type: ts.Type) {
	return (
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlySet) ||
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Set)
	);
}

export function isMapType(state: TransformState, type: ts.Type) {
	return (
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyMap) ||
		type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Map)
	);
}

export function isGeneratorType(state: TransformState, type: ts.Type) {
	return type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Generator);
}

export function isIterableFunctionType(state: TransformState, type: ts.Type) {
	if (type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.IterableFunction)) {
		return true;
	}

	// temporary?
	if (
		type.symbol &&
		(type.symbol.name === "FirstDecrementedIterableFunction" ||
			type.symbol.name === "DoubleDecrementedIterableFunction")
	) {
		return true;
	}

	return false;
}

export function isLuaTupleType(state: TransformState, type: ts.Type) {
	return type.aliasSymbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.LuaTuple);
}

export function isIterableFunctionLuaTupleType(state: TransformState, type: ts.Type) {
	if (isIterableFunctionType(state, type)) {
		const firstTypeArg: ts.Type | undefined = getTypeArguments(state, type)[0];
		return firstTypeArg !== undefined && isLuaTupleType(state, firstTypeArg);
	}
	return false;
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
	return isStringType(type);
}

export function isRoactElementType(state: TransformState, type: ts.Type) {
	const symbol = state.services.roactSymbolManager?.getSymbolOrThrow(ROACT_SYMBOL_NAMES.Element);
	return symbol !== undefined && type.symbol === symbol;
}

// type utilities

export function walkTypes(type: ts.Type, callback: (type: ts.Type) => void) {
	if (type.isUnionOrIntersection()) {
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
