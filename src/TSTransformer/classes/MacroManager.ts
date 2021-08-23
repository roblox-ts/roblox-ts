import { ProjectError } from "Shared/errors/ProjectError";
import { assert } from "Shared/util/assert";
import { CALL_MACROS } from "TSTransformer/macros/callMacros";
import { CONSTRUCTOR_MACROS } from "TSTransformer/macros/constructorMacros";
import { IDENTIFIER_MACROS } from "TSTransformer/macros/identifierMacros";
import { PROPERTY_CALL_MACROS } from "TSTransformer/macros/propertyCallMacros";
import { CallMacro, ConstructorMacro, IdentifierMacro, MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { getConstructorSymbol } from "TSTransformer/util/getConstructorSymbol";
import { skipUpwards } from "TSTransformer/util/traversal";
import ts from "typescript";

function getType(typeChecker: ts.TypeChecker, node: ts.Node) {
	return typeChecker.getTypeAtLocation(skipUpwards(node));
}

const TYPES_NOTICE = "\nYou may need to update your @rbxts/compiler-types!";

export const SYMBOL_NAMES = {
	ArrayConstructor: "ArrayConstructor",
	SetConstructor: "SetConstructor",
	MapConstructor: "MapConstructor",
	WeakSetConstructor: "WeakSetConstructor",
	WeakMapConstructor: "WeakMapConstructor",
	ReadonlyMapConstructor: "ReadonlyMapConstructor",
	ReadonlySetConstructor: "ReadonlySetConstructor",

	Array: "Array",
	Generator: "Generator",
	IterableFunction: "IterableFunction",
	LuaTuple: "LuaTuple",
	Map: "Map",
	Object: "Object",
	ReadonlyArray: "ReadonlyArray",
	ReadonlyMap: "ReadonlyMap",
	ReadonlySet: "ReadonlySet",
	ReadVoxelsArray: "ReadVoxelsArray",
	Set: "Set",
	String: "String",
	TemplateStringsArray: "TemplateStringsArray",
	WeakMap: "WeakMap",
	WeakSet: "WeakSet",

	Iterable: "Iterable",
} as const;

export const NOMINAL_LUA_TUPLE_NAME = "_nominal_LuaTuple";

const MACRO_ONLY_CLASSES = new Set<string>([
	"ReadonlyArray",
	"Array",
	"ReadonlyMap",
	"Map",
	"ReadonlySet",
	"Set",
	"String",
]);

function getFirstDeclarationOrThrow<T extends ts.Node>(symbol: ts.Symbol, check: (value: ts.Node) => value is T): T {
	for (const declaration of symbol.declarations ?? []) {
		if (check(declaration)) {
			return declaration;
		}
	}
	throw new ProjectError("getFirstDeclarationOrThrow failed to find first declaration");
}

function getGlobalSymbolByNameOrThrow(typeChecker: ts.TypeChecker, name: string, meaning: ts.SymbolFlags) {
	const symbol = typeChecker.resolveName(name, undefined, meaning, false);
	if (symbol) {
		return symbol;
	}
	throw new ProjectError(`MacroManager could not find symbol for ${name}` + TYPES_NOTICE);
}

function getConstructorSymbolOrThrow(node: ts.InterfaceDeclaration) {
	const construct = getConstructorSymbol(node);
	if (construct) {
		return construct;
	}
	throw new ProjectError(`MacroManager could not find constructor for ${node.name.text}` + TYPES_NOTICE);
}

/**
 * Manages the macros of the ts.
 */
export class MacroManager {
	private symbols = new Map<string, ts.Symbol>();
	private identifierMacros = new Map<ts.Symbol, IdentifierMacro>();
	private callMacros = new Map<ts.Symbol, CallMacro>();
	private constructorMacros = new Map<ts.Symbol, ConstructorMacro>();
	private propertyCallMacros = new Map<ts.Symbol, PropertyCallMacro>();
	private customMacroClasses = new Set<ts.Symbol>();

	constructor(private typeChecker: ts.TypeChecker) {
		for (const [name, macro] of Object.entries(IDENTIFIER_MACROS)) {
			const symbol = getGlobalSymbolByNameOrThrow(typeChecker, name, ts.SymbolFlags.Variable);
			this.identifierMacros.set(symbol, macro);
		}

		for (const [name, macro] of Object.entries(CALL_MACROS)) {
			const symbol = getGlobalSymbolByNameOrThrow(typeChecker, name, ts.SymbolFlags.Function);
			this.callMacros.set(symbol, macro);
		}

		for (const [className, macro] of Object.entries(CONSTRUCTOR_MACROS)) {
			const symbol = getGlobalSymbolByNameOrThrow(typeChecker, className, ts.SymbolFlags.Interface);
			const interfaceDec = getFirstDeclarationOrThrow(symbol, ts.isInterfaceDeclaration);
			const constructSymbol = getConstructorSymbolOrThrow(interfaceDec);
			this.constructorMacros.set(constructSymbol, macro);
		}

		for (const [className, methods] of Object.entries(PROPERTY_CALL_MACROS)) {
			const symbol = getGlobalSymbolByNameOrThrow(typeChecker, className, ts.SymbolFlags.Interface);

			const methodMap = new Map<string, ts.Symbol>();
			for (const declaration of symbol.declarations ?? []) {
				if (ts.isInterfaceDeclaration(declaration)) {
					for (const member of declaration.members) {
						if (ts.isMethodSignature(member) && ts.isIdentifier(member.name)) {
							const symbol = getType(typeChecker, member).symbol;
							assert(symbol);
							methodMap.set(member.name.text, symbol);
						}
					}
				}
			}

			for (const [methodName, macro] of Object.entries(methods)) {
				const methodSymbol = methodMap.get(methodName);
				if (!methodSymbol) {
					throw new ProjectError(
						`MacroManager could not find method for ${className}.${methodName}` + TYPES_NOTICE,
					);
				}
				this.propertyCallMacros.set(methodSymbol, macro);
			}
		}

		for (const symbolName of Object.values(SYMBOL_NAMES)) {
			const symbol = typeChecker.resolveName(symbolName, undefined, ts.SymbolFlags.All, false);
			if (symbol) {
				this.symbols.set(symbolName, symbol);
			} else {
				throw new ProjectError(`MacroManager could not find symbol for ${symbolName}` + TYPES_NOTICE);
			}
		}

		const luaTupleTypeDec = this.symbols
			.get(SYMBOL_NAMES.LuaTuple)
			?.declarations?.find(v => ts.isTypeAliasDeclaration(v));
		if (luaTupleTypeDec) {
			const nominalLuaTupleSymbol = typeChecker
				.getTypeAtLocation(luaTupleTypeDec)
				.getProperty(NOMINAL_LUA_TUPLE_NAME);
			if (nominalLuaTupleSymbol) {
				this.symbols.set(NOMINAL_LUA_TUPLE_NAME, nominalLuaTupleSymbol);
			}
		}
	}

	public addMacroClassMethods(symbol: ts.Symbol, methods: MacroList<PropertyCallMacro>) {
		const methodMap = new Map<string, ts.Symbol>();
		for (const declaration of symbol.declarations ?? []) {
			if (ts.isInterfaceDeclaration(declaration)) {
				for (const member of declaration.members) {
					if (ts.isMethodSignature(member) && ts.isIdentifier(member.name)) {
						const symbol = getType(this.typeChecker, member).symbol;
						assert(symbol);
						methodMap.set(member.name.text, symbol);
					}
				}
			}
		}

		for (const [methodName, macro] of Object.entries(methods)) {
			const methodSymbol = methodMap.get(methodName);
			if (!methodSymbol) {
				throw new ProjectError(`MacroManager could not find method for ${symbol.name}.${methodName}`);
			}
			this.propertyCallMacros.set(methodSymbol, macro);
			methodMap.delete(methodName);
		}
		if (methodMap.size !== 0) {
			// All methods were macros
			this.customMacroClasses.add(symbol);
		}
	}

	public addConstructorMacro(symbol: ts.Symbol, macro: ConstructorMacro) {
		const interfaceDec = getFirstDeclarationOrThrow(symbol, ts.isInterfaceDeclaration);
		const constructSymbol = getConstructorSymbolOrThrow(interfaceDec);
		this.constructorMacros.set(constructSymbol, macro);
	}

	public addCallMacro(symbol: ts.Symbol, macro: CallMacro) {
		this.callMacros.set(symbol, macro);
	}

	public addIdentifierMacro(symbol: ts.Symbol, macro: IdentifierMacro) {
		this.identifierMacros.set(symbol, macro);
	}

	public getSymbolOrThrow(name: string) {
		const symbol = this.symbols.get(name);
		assert(symbol);
		return symbol;
	}

	public isMacroOnlyClass(symbol: ts.Symbol) {
		return (
			this.customMacroClasses.has(symbol) ||
			(this.symbols.get(symbol.name) === symbol && MACRO_ONLY_CLASSES.has(symbol.name))
		);
	}

	public getIdentifierMacro(symbol: ts.Symbol) {
		return this.identifierMacros.get(symbol);
	}

	public getCallMacro(symbol: ts.Symbol) {
		return this.callMacros.get(symbol);
	}

	public getConstructorMacro(symbol: ts.Symbol) {
		return this.constructorMacros.get(symbol);
	}

	public getPropertyCallMacro(symbol: ts.Symbol) {
		const macro = this.propertyCallMacros.get(symbol);
		if (
			!macro &&
			symbol.parent &&
			this.symbols.get(symbol.parent.name) === symbol.parent &&
			this.isMacroOnlyClass(symbol.parent)
		) {
			assert(false, `Macro ${symbol.parent.name}.${symbol.name}() is not implemented!`);
		}
		return macro;
	}
}
