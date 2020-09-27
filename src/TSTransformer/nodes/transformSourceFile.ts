import ts from "byots";
import luau from "LuauAST";
import { RbxType } from "Shared/classes/RojoResolver";
import { COMPILER_VERSION } from "Shared/constants";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";
import { getAncestor } from "TSTransformer/util/traversal";

function getExportPair(state: TransformState, exportSymbol: ts.Symbol): [name: string, id: luau.Identifier] {
	const declaration = exportSymbol.getDeclarations()?.[0];
	if (declaration && ts.isExportSpecifier(declaration)) {
		return [declaration.name.text, transformIdentifierDefined(state, declaration.propertyName ?? declaration.name)];
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

function isExportSymbolFromImport(state: TransformState, exportSymbol: ts.Symbol) {
	const exportDeclarations = exportSymbol.getDeclarations();
	if (exportDeclarations && exportDeclarations.length > 0 && ts.isExportSpecifier(exportDeclarations[0])) {
		const importSymbol = state.typeChecker.getExportSpecifierLocalTargetSymbol(
			exportDeclarations[0] as ts.ExportSpecifier,
		);
		if (importSymbol) {
			const importDeclarations = importSymbol.getDeclarations();
			if (
				importDeclarations &&
				importDeclarations.length > 0 &&
				getAncestor(importDeclarations[0], ts.isImportDeclaration) !== undefined
			) {
				return true;
			}
		}
	}
	return false;
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
	let mustPushExports = state.hasExportFrom;
	const exportPairs = new Array<[string, luau.Identifier]>();
	if (!state.hasExportEquals) {
		for (const exportSymbol of state.getModuleExports(symbol)) {
			if (exportSymbol.name === "prototype") {
				continue;
			}
			const originalSymbol = ts.skipAlias(exportSymbol, state.typeChecker);
			if (
				isExportSymbolFromImport(state, exportSymbol) ||
				(isSymbolOfValue(originalSymbol) && originalSymbol.valueDeclaration.getSourceFile() === sourceFile)
			) {
				if (isDefinedAsLet(state, originalSymbol)) {
					mustPushExports = true;
					continue;
				}
				if (exportSymbol.name === "default") {
					const declaration = exportSymbol.getDeclarations()?.[0];
					if (declaration) {
						const ancestor = getAncestor(declaration, ts.isExportDeclaration);
						if (ancestor && ancestor.moduleSpecifier !== undefined) {
							continue;
						}
					}
				}
				exportPairs.push(getExportPair(state, exportSymbol));
			}
		}
	}

	if (state.hasExportEquals) {
		// local exports variable is created in transformExportAssignment
		const finalStatement = sourceFile.statements[sourceFile.statements.length - 1];
		if (!ts.isExportAssignment(finalStatement) || !finalStatement.isExportEquals) {
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
					left: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
						expression: luau.globals.exports,
						name: exportKey,
					}),
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
	const statements = transformStatementList(state, node.statements);

	handleExports(state, node, symbol, statements);

	// moduleScripts must `return nil` if they do not export any values
	const lastStatement = getLastNonCommentStatement(statements.tail);
	if (!lastStatement || !luau.isReturnStatement(lastStatement.value)) {
		const outputPath = state.services.pathTranslator.getOutputPath(node.fileName);
		if (state.rojoResolver.getRbxTypeFromFilePath(outputPath) === RbxType.ModuleScript) {
			luau.list.push(statements, luau.create(luau.SyntaxKind.ReturnStatement, { expression: luau.nil() }));
		}
	}

	// add the Runtime library to the tree if it is used
	if (state.usesRuntimeLib) {
		luau.list.unshift(statements, state.createRuntimeLibImport(node));
	}

	// add build information to the tree
	luau.list.unshift(statements, luau.comment(`Compiled with roblox-ts v${COMPILER_VERSION}`));

	return statements;
}
