import luau from "@roblox-ts/luau-ast";
import { RbxType } from "@roblox-ts/rojo-resolver";
import { COMPILER_VERSION } from "Shared/constants";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { getOriginalSymbolOfNode } from "TSTransformer/util/getOriginalSymbolOfNode";
import { isSymbolMutable } from "TSTransformer/util/isSymbolMutable";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";
import { getAncestor } from "TSTransformer/util/traversal";
import ts from "typescript";

function getExportPair(state: TransformState, exportSymbol: ts.Symbol): [name: string, id: luau.AnyIdentifier] {
	const declaration = exportSymbol.getDeclarations()?.[0];
	if (declaration && ts.isExportSpecifier(declaration)) {
		const exportName = declaration.propertyName ?? declaration.name;
		if (ts.isIdentifier(exportName)) {
			return [declaration.name.text, transformIdentifierDefined(state, exportName)];
		} else {
			return [declaration.name.text, luau.create(luau.SyntaxKind.Identifier, {
				name: exportName.text,
			})];
		}
	} else {
		let name = exportSymbol.name;
		if (
			exportSymbol.name === "default" &&
			declaration &&
			(ts.isFunctionDeclaration(declaration) || ts.isClassDeclaration(declaration)) &&
			declaration.name
		) {
			name = declaration.name.text;
		}

		return [exportSymbol.name, luau.id(name)];
	}
}

function isExportSymbolFromExportFrom(exportSymbol: ts.Symbol) {
	if (exportSymbol.declarations) {
		for (const exportSpecifier of exportSymbol.declarations) {
			if (ts.isExportSpecifier(exportSpecifier)) {
				const exportDec = exportSpecifier.parent.parent;
				if (ts.isExportDeclaration(exportDec) && exportDec.moduleSpecifier) {
					return true;
				}
			}
		}
	}
	return false;
}

function getIgnoredExportSymbols(state: TransformState, sourceFile: ts.SourceFile): Set<ts.Symbol> {
	const ignoredSymbols = new Set<ts.Symbol>();
	for (const statement of sourceFile.statements) {
		if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
			if (!statement.exportClause) {
				// export * from "./module";
				const moduleSymbol = getOriginalSymbolOfNode(state.typeChecker, statement.moduleSpecifier);
				if (moduleSymbol) {
					state.getModuleExports(moduleSymbol).forEach(v => ignoredSymbols.add(v));
				}
			} else if (ts.isNamespaceExport(statement.exportClause)) {
				// export * as id from "./module";
				const idSymbol = state.typeChecker.getSymbolAtLocation(statement.exportClause.name);
				if (idSymbol) {
					ignoredSymbols.add(idSymbol);
				}
			}
		}
	}
	return ignoredSymbols;
}

/**
 * used to ignore exports in the form of `export declare const x: T;`
 * however, this should still allow exports which are declare + export separately, i.e.
 * ```ts
 * declare const x: number;
 * export { x };
 * ```
 * this mimics TypeScript behavior
 */
function isExportSymbolOnlyFromDeclare(exportSymbol: ts.Symbol): boolean {
	return (
		exportSymbol.declarations?.every(declaration => {
			const statement = getAncestor(declaration, ts.isStatement);
			const modifiers = statement && ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
			return modifiers?.some(v => v.kind === ts.SyntaxKind.DeclareKeyword);
		}) ?? false
	);
}

/**
 * Adds export information to the end of the tree.
 * @param state The current transform state.
 * @param symbol The symbol of the file.
 * @param statements The transformed list of statements of the state.
 */
function handleExports(
	state: TransformState,
	sourceFile: ts.SourceFile,
	symbol: ts.Symbol,
	statements: luau.List<luau.Statement>,
) {
	const ignoredExportSymbols = getIgnoredExportSymbols(state, sourceFile);

	let mustPushExports = state.hasExportFrom;
	const exportPairs = new Array<[string, luau.AnyIdentifier]>();
	if (!state.hasExportEquals) {
		for (const exportSymbol of state.getModuleExports(symbol)) {
			if (ignoredExportSymbols.has(exportSymbol)) continue;

			// ignore prototype exports
			if (!!(exportSymbol.flags & ts.SymbolFlags.Prototype)) continue;

			// export { default as x } from "./module";
			if (isExportSymbolFromExportFrom(exportSymbol)) continue;

			const originalSymbol = ts.skipAlias(exportSymbol, state.typeChecker);

			// only export values
			if (!isSymbolOfValue(originalSymbol)) continue;

			// handle this in transformIdentifier
			if (isSymbolMutable(state, originalSymbol)) {
				mustPushExports = true;
				continue;
			}

			// ignore exports in the form of `export declare const x: T;`
			if (isExportSymbolOnlyFromDeclare(exportSymbol)) continue;

			exportPairs.push(getExportPair(state, exportSymbol));
		}
	}

	if (state.hasExportEquals) {
		// local exports variable is created in transformExportAssignment
		const finalStatement = sourceFile.statements[sourceFile.statements.length - 1];
		if (!(ts.isExportAssignment(finalStatement) && finalStatement.isExportEquals)) {
			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.ReturnStatement, {
					expression: luau.globals.exports,
				}),
			);
		}
	} else if (mustPushExports) {
		// if there's an export let/from, we need to put `local exports = {}` at the top of the file
		luau.list.unshift(
			statements,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: luau.globals.exports,
				right: luau.map(),
			}),
		);
		for (const [exportKey, exportId] of exportPairs) {
			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.Assignment, {
					left: luau.property(luau.globals.exports, exportKey),
					operator: "=",
					right: exportId,
				}),
			);
		}
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.ReturnStatement, {
				expression: luau.globals.exports,
			}),
		);
	} else if (exportPairs.length > 0) {
		// only regular exports, we can do this as just returning an object at the bottom of the file
		const fields = luau.list.make<luau.MapField>();
		for (const [exportKey, exportId] of exportPairs) {
			luau.list.push(
				fields,
				luau.create(luau.SyntaxKind.MapField, {
					index: luau.string(exportKey),
					value: exportId,
				}),
			);
		}
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.ReturnStatement, {
				expression: luau.create(luau.SyntaxKind.Map, {
					fields,
				}),
			}),
		);
	}
}

function getLastNonCommentStatement(listNode?: luau.ListNode<luau.Statement>) {
	while (listNode && luau.isComment(listNode.value)) {
		listNode = listNode.prev;
	}
	return listNode;
}

/**
 * Creates and returns a luau.list<luau.Statement> (Luau AST).
 * @param state The current transform state.
 * @param node The sourcefile to convert to a Luau AST.
 */
export function transformSourceFile(state: TransformState, node: ts.SourceFile) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	assert(symbol);
	state.setModuleIdBySymbol(symbol, luau.globals.exports);

	// transform the `ts.Statements` of the source file into a `list.list<...>`
	const statements = transformStatementList(state, node, node.statements, undefined);

	handleExports(state, node, symbol, statements);

	// moduleScripts must `return nil` if they do not export any values
	const lastStatement = getLastNonCommentStatement(statements.tail);
	if (!lastStatement || !luau.isReturnStatement(lastStatement.value)) {
		const outputPath = state.pathTranslator.getOutputPath(node.fileName);
		if (state.rojoResolver.getRbxTypeFromFilePath(outputPath) === RbxType.ModuleScript) {
			luau.list.push(statements, luau.create(luau.SyntaxKind.ReturnStatement, { expression: luau.nil() }));
		}
	}

	const headerStatements = luau.list.make<luau.Statement>();

	// add build information to the tree
	luau.list.push(headerStatements, luau.comment(` Compiled with roblox-ts v${COMPILER_VERSION}`));

	// add the Runtime library to the tree if it is used
	if (state.usesRuntimeLib) {
		luau.list.push(headerStatements, state.createRuntimeLibImport(node));
	}

	// extract Luau directive comments like --!strict so we can put them before headerStatements
	const directiveComments = luau.list.make<luau.Statement>();
	while (statements.head && luau.isComment(statements.head.value) && statements.head.value.text.startsWith("!")) {
		// safety: statements.head is checked in while condition
		luau.list.push(directiveComments, luau.list.shift(statements)!);
	}

	luau.list.unshiftList(statements, headerStatements);
	luau.list.unshiftList(statements, directiveComments);

	return statements;
}
