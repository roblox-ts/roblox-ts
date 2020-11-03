import ts from "byots";
import { ProjectError } from "Shared/errors/ProjectError";
import { assert } from "Shared/util/assert";
import { CALL_MACROS } from "TSTransformer/macros/callMacros";
import { CONSTRUCTOR_MACROS } from "TSTransformer/macros/constructorMacros";
import { IDENTIFIER_MACROS } from "TSTransformer/macros/identifierMacros";
import { PROPERTY_CALL_MACROS } from "TSTransformer/macros/propertyCallMacros";
import { CallMacro, ConstructorMacro, IdentifierMacro, PropertyCallMacro } from "TSTransformer/macros/types";
import { skipUpwards } from "TSTransformer/util/traversal";

function getType(typeChecker: ts.TypeChecker, node: ts.Node) {
	return typeChecker.getTypeAtLocation(skipUpwards(node));
}

const TYPES_NOTICE = "\nYou may need to update your @rbxts/types!";

export const SYMBOL_NAMES = {
	ArrayConstructor: "ArrayConstructor",
	SetConstructor: "SetConstructor",
	MapConstructor: "MapConstructor",
	WeakSetConstructor: "WeakSetConstructor",
	WeakMapConstructor: "WeakMapConstructor",
	ReadonlyMapConstructor: "ReadonlyMapConstructor",
	ReadonlySetConstructor: "ReadonlySetConstructor",

	Array: "Array",
	DoubleDecrementedIterableFunction: "DoubleDecrementedIterableFunction",
	FirstDecrementedIterableFunction: "FirstDecrementedIterableFunction",
	IterableFunction: "IterableFunction",
	Generator: "Generator",
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
} as const;

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
	throw new ProjectError("");
}

function getGlobalSymbolByNameOrThrow(typeChecker: ts.TypeChecker, name: string, meaning: ts.SymbolFlags) {
	const symbol = typeChecker.resolveName(name, undefined, meaning, false);
	if (symbol) {
		return symbol;
	}
	throw new ProjectError(`MacroManager could not find symbol for ${name}` + TYPES_NOTICE);
}

function getConstructorSymbol(node: ts.InterfaceDeclaration) {
	for (const member of node.members) {
		if (ts.isConstructSignatureDeclaration(member)) {
			assert(member.symbol);
			return member.symbol;
		}
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

	constructor(program: ts.Program, typeChecker: ts.TypeChecker, nodeModulesPath: string) {
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
			const constructSymbol = getConstructorSymbol(interfaceDec);
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
	}

	public getSymbolOrThrow(name: string) {
		const symbol = this.symbols.get(name);
		assert(symbol);
		return symbol;
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
		if (symbol.parent) {
			const macro = this.propertyCallMacros.get(symbol);
			if (!macro) {
				const parentClass = this.symbols.get(symbol.parent.name);
				if (parentClass && MACRO_ONLY_CLASSES.has(parentClass.name)) {
					assert(false, `Macro ${parentClass.name}.${symbol.name}() is not implemented!`);
				}
			}
			return macro;
		}
	}
}
