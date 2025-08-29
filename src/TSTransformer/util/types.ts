import path from "path";
import { RBXTS_SCOPE } from "Shared/constants";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";
import { NOMINAL_LUA_TUPLE_NAME } from "TSTransformer/classes/MacroManager";
import { isTemplateLiteralType } from "TSTransformer/typeGuards";
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

function isDefinitelyTypeInner(type: ts.Type, callbacks: Array<TypeCheck>): boolean {
	if (type.isUnion()) {
		return type.types.every(t => isDefinitelyTypeInner(t, callbacks));
	} else if (type.isIntersection()) {
		return type.types.some(t => isDefinitelyTypeInner(t, callbacks));
	} else {
		if (type.isClassOrInterface() && getRecursiveBaseTypes(type).some(t => isDefinitelyTypeInner(t, callbacks))) {
			return true;
		}
		return callbacks.some(cb => cb(type));
	}
}

export function isDefinitelyType(type: ts.Type, ...callbacks: Array<TypeCheck>) {
	return isDefinitelyTypeInner(type.getConstraint() ?? type, callbacks);
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
		}

		// defined type
		if (isDefinedType(type)) {
			if (callbacks.length === 1 && callbacks[0] === isUndefinedType) {
				// if only matching undefined, then defined means not possible
				return false;
			}
			return true;
		}

		return callbacks.some(cb => cb(type));
	}
}

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

export function isAnyType(state: TransformState): TypeCheck {
	return type => type === state.typeChecker.getAnyType();
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
	return type => {
		// typeChecker.isArrayLikeType() will return true for `any`, so rule it out here
		if (!!(type.flags & ts.TypeFlags.Any)) {
			return false;
		}
		return (
			state.typeChecker.isTupleType(type) ||
			state.typeChecker.isArrayLikeType(type) ||
			type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyArray) ||
			type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Array) ||
			type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadVoxelsArray) ||
			type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.TemplateStringsArray)
		);
	};
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

export function isSharedTableType(state: TransformState): TypeCheck {
	return type => type.symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.SharedTable);
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

export function isRobloxType(state: TransformState): TypeCheck {
	const typesPath = path.join(state.data.nodeModulesPath, RBXTS_SCOPE, "types");
	return type =>
		type.symbol?.declarations?.some(d => {
			const filePath = d.getSourceFile()?.fileName;
			return filePath !== undefined && isPathDescendantOf(filePath, typesPath);
		}) ?? false;
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
