import ts from "byots";
import path from "path";
import { ProjectError } from "Shared/errors/ProjectError";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { CALL_MACROS } from "TSTransformer/macros/callMacros";
import { CONSTRUCTOR_MACROS } from "TSTransformer/macros/constructorMacros";
import { IDENTIFIER_MACROS } from "TSTransformer/macros/identifierMacros";
import { PROPERTY_CALL_MACROS } from "TSTransformer/macros/propertyCallMacros";
import { CallMacro, ConstructorMacro, IdentifierMacro, PropertyCallMacro } from "TSTransformer/macros/types";
import { skipUpwards } from "TSTransformer/util/traversal";

function getType(typeChecker: ts.TypeChecker, node: ts.Node) {
	return typeChecker.getTypeAtLocation(skipUpwards(node));
}

const INCLUDE_FILES = ["es.d.ts", "lua.d.ts", "macro_math.d.ts", "roblox.d.ts"];

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
	ReadonlyArray: "ReadonlyArray",
	ReadonlyMap: "ReadonlyMap",
	ReadonlySet: "ReadonlySet",
	ReadVoxelsArray: "ReadVoxelsArray",
	Set: "Set",
	String: "String",
	TemplateStringsArray: "TemplateStringsArray",
} as const;

const MACRO_ONLY_CLASSES = new Set<string>(["ReadonlyArray", "Array", "ReadonlyMap", "Map", "ReadonlySet", "Set"]);

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
		// initialize maps
		const typeAliases = new Map<string, Set<ts.Symbol>>();
		const identifiers = new Map<string, Set<ts.Symbol>>();
		const functions = new Map<string, Set<ts.Symbol>>();
		const interfaces = new Map<
			string,
			{
				symbols: Set<ts.Symbol>;
				constructors: Set<ts.Symbol>;
				methods: Map<string, Set<ts.Symbol>>;
			}
		>();

		const typesPath = path.join(nodeModulesPath, "types", "include");
		// iterate through each file in the types include directory
		for (const fileName of INCLUDE_FILES) {
			const filePath = path.join(typesPath, fileName);
			const sourceFile = program.getSourceFile(filePath);
			if (!sourceFile) {
				throw new ProjectError(`MacroManager Could not find source file for ${filePath}`);
			}

			// iterate through each statement of the type definition source file
			for (const statement of sourceFile.statements) {
				// set up mappings for declarations
				if (ts.isTypeAliasDeclaration(statement)) {
					const typeAliasSymbols = getOrSetDefault(
						typeAliases,
						statement.name.text,
						() => new Set<ts.Symbol>(),
					);
					const symbol = statement.symbol;
					assert(symbol);
					typeAliasSymbols.add(symbol);
				} else if (ts.isVariableStatement(statement)) {
					for (const declaration of statement.declarationList.declarations) {
						if (ts.isIdentifier(declaration.name)) {
							const identifierName = declaration.name.text;
							const identifierSymbols = getOrSetDefault(
								identifiers,
								identifierName,
								() => new Set<ts.Symbol>(),
							);
							assert(declaration.symbol);
							identifierSymbols.add(declaration.symbol);
						}
					}
				} else if (ts.isFunctionDeclaration(statement)) {
					assert(statement.name);
					const functionSymbols = getOrSetDefault(functions, statement.name.text, () => new Set<ts.Symbol>());
					const symbol = getType(typeChecker, statement).symbol;
					assert(symbol);
					functionSymbols.add(symbol);
				} else if (ts.isInterfaceDeclaration(statement)) {
					const interfaceInfo = getOrSetDefault(interfaces, statement.name.text, () => ({
						symbols: new Set<ts.Symbol>(),
						constructors: new Set<ts.Symbol>(),
						methods: new Map<string, Set<ts.Symbol>>(),
					}));

					const symbol = getType(typeChecker, statement).symbol;
					assert(symbol);
					interfaceInfo.symbols.add(symbol);
					assert(interfaceInfo.symbols.size === 1);

					for (const member of statement.members) {
						if (ts.isMethodSignature(member)) {
							if (ts.isIdentifier(member.name)) {
								const methodName = member.name.text;
								const methodSymbols = getOrSetDefault(
									interfaceInfo.methods,
									methodName,
									() => new Set<ts.Symbol>(),
								);
								const symbol = getType(typeChecker, member).symbol;
								assert(symbol);
								methodSymbols.add(symbol);
							}
						} else if (ts.isConstructSignatureDeclaration(member)) {
							assert(member.symbol);
							interfaceInfo.constructors.add(member.symbol);
						}
					}
				}
			}
		}

		// iterate through each of the macro groups
		for (const symbolName of Object.values(SYMBOL_NAMES)) {
			// verify that interface has a mapping somewhere
			// set up a mapping to the symbol
			const interfaceInfo = interfaces.get(symbolName);
			if (interfaceInfo) {
				const [symbol] = interfaceInfo.symbols;
				this.symbols.set(symbolName, symbol);
				continue;
			}

			const typeAliasSymbols = typeAliases.get(symbolName);
			if (typeAliasSymbols) {
				const [symbol] = typeAliasSymbols;
				this.symbols.set(symbolName, symbol);
				continue;
			}

			throw new ProjectError(`MacroManager could not find symbol for ${symbolName}`);
		}

		// iterate through each of the simple identifier macros like `PKG_VERSION`
		for (const [identifierName, macro] of Object.entries(IDENTIFIER_MACROS)) {
			// get the symbols of all the identifier macros
			const identifierSymbols = identifiers.get(identifierName);
			if (!identifierSymbols) {
				throw new ProjectError(`MacroManager could not find identifier for ${identifierName}`);
			}
			// map each of the symbols to the macro
			for (const symbol of identifierSymbols) {
				this.identifierMacros.set(symbol, macro);
			}
		}

		// iterate through each of the call macros like `opcall()`
		for (const [funcName, macro] of Object.entries(CALL_MACROS)) {
			// get the symbols of all the function macros
			const functionSymbols = functions.get(funcName);
			if (!functionSymbols) {
				throw new ProjectError(`MacroManager could not find function for ${funcName}`);
			}
			// map each of the symbols to the macro
			for (const symbol of functionSymbols) {
				this.callMacros.set(symbol, macro);
			}
		}

		// iterate through each of the constructor macros like `SetConstructor`
		for (const [className, macro] of Object.entries(CONSTRUCTOR_MACROS)) {
			// get information about the interface that is being constructed
			const interfaceInfo = interfaces.get(className);
			if (!interfaceInfo) {
				throw new ProjectError(`MacroManager could not find interface for ${className}`);
			}
			// map each of the symbols to the macro
			for (const symbol of interfaceInfo.constructors) {
				this.constructorMacros.set(symbol, macro);
			}
		}

		// iterate through each of the property call maros like `Object: { clone: () => {}}`
		for (const [className, methods] of Object.entries(PROPERTY_CALL_MACROS)) {
			// get the information about the interface being called
			const interfaceInfo = interfaces.get(className);
			if (!interfaceInfo) {
				throw new ProjectError(`MacroManager could not find interface for ${className}`);
			}
			// iterate through each of the property call macros (methods) in the interface
			for (const [methodName, macro] of Object.entries(methods)) {
				// get the symbols of all the property calls
				const methodSymbols = interfaceInfo.methods.get(methodName);
				if (!methodSymbols) {
					throw new ProjectError(`MacroManager could not find method for ${className}.${methodName}`);
				}
				// map each of the symbols to the macro
				for (const methodSymbol of methodSymbols) {
					this.propertyCallMacros.set(methodSymbol, macro);
				}
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
