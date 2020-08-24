import ts from "byots";
import luau from "LuauAST";
import { Lazy } from "Shared/classes/Lazy";
import { TransformState } from "TSTransformer";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { createImportExpression } from "TSTransformer/util/createImportExpression";
import { getSourceFileFromModuleSpecifier } from "TSTransformer/util/getSourceFileFromModuleSpecifier";

function countImportExpUses(state: TransformState, importClause: ts.ImportClause) {
	let uses = 0;

	if (importClause.name) {
		if (state.resolver.isReferencedAliasDeclaration(importClause)) {
			uses++;
		}
	}

	if (importClause.namedBindings) {
		if (ts.isNamespaceImport(importClause.namedBindings)) {
			uses++;
		} else {
			for (const element of importClause.namedBindings.elements) {
				if (state.resolver.isReferencedAliasDeclaration(element)) {
					uses++;
				}
			}
		}
	}

	return uses;
}

export function transformImportDeclaration(state: TransformState, node: ts.ImportDeclaration) {
	// no emit for type only
	const importClause = node.importClause;
	if (importClause && importClause.isTypeOnly) return luau.list.make<luau.Statement>();

	const statements = luau.list.make<luau.Statement>();

	const importExp = new Lazy<luau.CallExpression | luau.AnyIdentifier>(() =>
		createImportExpression(state, node.getSourceFile(), node.moduleSpecifier),
	);

	if (importClause) {
		// detect if we need to push to a new var or not
		const uses = countImportExpUses(state, importClause);
		if (uses > 1) {
			const id = luau.tempId();
			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: id,
					right: importExp.get(),
				}),
			);
			importExp.set(id);
		}

		// default import logic
		if (importClause.name) {
			if (state.resolver.isReferencedAliasDeclaration(importClause)) {
				const moduleFile = getSourceFileFromModuleSpecifier(state.typeChecker, node.moduleSpecifier);
				if (moduleFile && moduleFile.statements.some(v => ts.isExportAssignment(v) && v.isExportEquals)) {
					luau.list.pushList(statements, transformVariable(state, importClause.name, importExp.get())[1]);
				} else {
					luau.list.pushList(
						statements,
						transformVariable(
							state,
							importClause.name,
							luau.create(luau.SyntaxKind.PropertyAccessExpression, {
								expression: importExp.get(),
								name: "default",
							}),
						)[1],
					);
				}
			}
		}

		if (importClause.namedBindings) {
			// namespace import logic
			if (ts.isNamespaceImport(importClause.namedBindings)) {
				luau.list.pushList(
					statements,
					transformVariable(state, importClause.namedBindings.name, importExp.get())[1],
				);
			} else {
				// named elements import logic
				for (const element of importClause.namedBindings.elements) {
					if (state.resolver.isReferencedAliasDeclaration(element)) {
						luau.list.pushList(
							statements,
							transformVariable(
								state,
								element.name,
								luau.create(luau.SyntaxKind.PropertyAccessExpression, {
									expression: importExp.get(),
									name: (element.propertyName ?? element.name).text,
								}),
							)[1],
						);
					}
				}
			}
		}
	}

	// ensure we emit something
	if (
		!importClause ||
		(state.compilerOptions.importsNotUsedAsValues === ts.ImportsNotUsedAsValues.Preserve &&
			luau.list.isEmpty(statements))
	) {
		const expression = importExp.get();
		if (luau.isCallExpression(expression)) {
			luau.list.push(statements, luau.create(luau.SyntaxKind.CallStatement, { expression }));
		}
	}

	return statements;
}
