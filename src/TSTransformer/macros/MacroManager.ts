import ts from "byots";
import fs from "fs-extra";
import path from "path";
import { ProjectError } from "Shared/errors/ProjectError";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { CALL_MACROS } from "TSTransformer/macros/callMacros";
import { CONSTRUCTOR_MACROS } from "TSTransformer/macros/constructorMacros";
import { IDENTIFIER_MACROS } from "TSTransformer/macros/identifierMacros";
import { PROPERTY_CALL_MACROS } from "TSTransformer/macros/propertyCallMacros";
import { CallMacro, ConstructorMacro, IdentifierMacro, PropertyCallMacro } from "TSTransformer/macros/types";
import { skipUpwards } from "TSTransformer/util/nodeTraversal";

function getType(typeChecker: ts.TypeChecker, node: ts.Node) {
	return typeChecker.getTypeAtLocation(skipUpwards(node));
}

const INCLUDE_FILES = ["es.d.ts", "lua.d.ts", "macro_math.d.ts", "roblox.d.ts"];

export const SYMBOL_NAMES = {
	Array: "Array",
	DoubleDecrementedIterableFunction: "DoubleDecrementedIterableFunction",
	FirstDecrementedIterableFunction: "FirstDecrementedIterableFunction",
	IterableFunction: "IterableFunction",
	IterableIterator: "IterableIterator",
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

export class MacroManager {
	private symbols = new Map<string, ts.Symbol>();
	private identifierMacros = new Map<ts.Symbol, IdentifierMacro>();
	private callMacros = new Map<ts.Symbol, CallMacro>();
	private constructorMacros = new Map<ts.Symbol, ConstructorMacro>();
	private propertyCallMacros = new Map<ts.Symbol, PropertyCallMacro>();

	constructor(program: ts.Program, typeChecker: ts.TypeChecker, nodeModulesPath: string) {
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

		const typesPath = path.join(nodeModulesPath, "@rbxts", "types", "include");
		for (const fileName of INCLUDE_FILES) {
			const filePath = path.join(typesPath, fileName);
			if (!fs.pathExistsSync(filePath)) {
				throw new ProjectError(`(MacroManager) Path does not exist ${filePath}`);
			}

			const sourceFile = program.getSourceFile(filePath);
			if (!sourceFile) {
				throw new ProjectError(`(MacroManager) Could not find source file for ${filePath}`);
			}

			for (const statement of sourceFile.statements) {
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

		for (const symbolName of Object.values(SYMBOL_NAMES)) {
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

			throw new ProjectError(`(MacroManager) No symbol found for ${symbolName}`);
		}

		for (const [identifierName, macro] of Object.entries(IDENTIFIER_MACROS)) {
			const identifierSymbols = identifiers.get(identifierName);
			if (!identifierSymbols) {
				throw new ProjectError(`(MacroManager) No identifier found for ${identifierName}`);
			}
			for (const symbol of identifierSymbols) {
				this.identifierMacros.set(symbol, macro);
			}
		}

		for (const [funcName, macro] of Object.entries(CALL_MACROS)) {
			const functionSymbols = functions.get(funcName);
			if (!functionSymbols) {
				throw new ProjectError(`(MacroManager) No function found for ${funcName}`);
			}
			for (const symbol of functionSymbols) {
				this.callMacros.set(symbol, macro);
			}
		}

		for (const [className, macro] of Object.entries(CONSTRUCTOR_MACROS)) {
			const interfaceInfo = interfaces.get(className);
			if (!interfaceInfo) {
				throw new ProjectError(`(MacroManager) No interface found for ${className}`);
			}
			for (const symbol of interfaceInfo.constructors) {
				this.constructorMacros.set(symbol, macro);
			}
		}

		for (const [className, methods] of Object.entries(PROPERTY_CALL_MACROS)) {
			const interfaceInfo = interfaces.get(className);
			if (!interfaceInfo) {
				throw new ProjectError(`(MacroManager) No interface found for ${className}`);
			}
			for (const [methodName, macro] of Object.entries(methods)) {
				const methodSymbols = interfaceInfo.methods.get(methodName);
				if (!methodSymbols) {
					throw new ProjectError(`(MacroManager) No method found for ${className}.${methodName}`);
				}
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
		return this.propertyCallMacros.get(symbol);
	}
}
