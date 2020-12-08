/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-expressions */

// modified version of https://github.com/LeDDGroup/typescript-transform-paths

/*
MIT License

Copyright (c) 2019 LeddGroup

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import ts from "byots";
import { existsSync } from "fs";
import { dirname, extname, relative, resolve } from "path";
import { assert } from "Shared/util/assert";
import { parse } from "url";

/* ****************************************************************************************************************** *
 * Helpers
 * ****************************************************************************************************************** */

export const normalizePath = (p: string) =>
	// Is extended length or has non-ascii chars (respectively)
	/^\\\\\?\\/.test(p) || /[^\u0000-\u0080]+/.test(p)
		? p
		: // Normalize to forward slash and remove repeating slashes
		  p.replace(/[\\\/]+/g, "/");

/* ****************************************************************************************************************** *
 * Transformer
 * ****************************************************************************************************************** */

export const transformPaths = (context: ts.TransformationContext) => (sourceFile: ts.SourceFile | ts.Bundle) => {
	assert(ts.isSourceFile(sourceFile));

	const resolver =
		typeof (context as any).getEmitResolver === "function" ? (context as any).getEmitResolver() : undefined;
	const compilerOptions = context.getCompilerOptions();
	const sourceDir = dirname(sourceFile.fileName);

	const implicitExtensions = [".ts", ".d.ts"];

	const allowJs = compilerOptions.allowJs === true;
	const allowJsx = compilerOptions.jsx !== undefined && compilerOptions.jsx !== ts.JsxEmit.None;
	const allowJson = compilerOptions.resolveJsonModule === true;

	allowJs && implicitExtensions.push(".js");
	allowJsx && implicitExtensions.push(".tsx");
	allowJs && allowJsx && implicitExtensions.push(".jsx");
	allowJson && implicitExtensions.push(".json");

	const { isDeclarationFile } = sourceFile;

	const { baseUrl = "", paths = {} } = compilerOptions;
	paths["*"] = paths["*"]?.concat("*") ?? ["*"];

	const binds = Object.keys(paths)
		.filter(key => paths[key].length)
		.map(key => ({
			regexp: new RegExp("^" + key.replace("*", "(.*)") + "$"),
			paths: paths[key],
		}));

	if (!baseUrl || binds.length === 0) {
		// There is nothing we can do without baseUrl and paths specified.
		return sourceFile;
	}

	function isRelative(s: string) {
		return s[0] === ".";
	}

	function isUrl(s: string) {
		return parse(s).protocol !== null;
	}

	function fileExists(s: string) {
		// check for implicit extensions .ts, .dts, etc...
		for (const ext of implicitExtensions) if (existsSync(s + ext)) return true;
		// else if has extensions, file must exist
		if (extname(s) !== "") return existsSync(s);
		return false;
	}

	function bindModuleToFile(moduleName: string) {
		if (isRelative(moduleName)) {
			// if it's relative path do not transform
			return moduleName;
		}

		for (const { regexp, paths } of binds) {
			const match = regexp.exec(moduleName);
			if (match) {
				for (const p of paths) {
					const out = p.replace(/\*/g, match[1]);

					if (isUrl(out)) return out;

					const filepath = resolve(baseUrl, out);
					if (!fileExists(`${filepath}/index`) && !fileExists(filepath)) continue;

					const resolved = fixupImportPath(relative(sourceDir, filepath));

					return isRelative(resolved) ? resolved : `./${resolved}`;
				}
			}
		}

		return undefined;
	}

	const isRequire = (node: ts.Node): node is ts.CallExpression =>
		ts.isCallExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === "require" &&
		ts.isStringLiteral(node.arguments[0]) &&
		node.arguments.length === 1;

	const isAsyncImport = (node: ts.Node): node is ts.CallExpression =>
		ts.isCallExpression(node) &&
		node.expression.kind === ts.SyntaxKind.ImportKeyword &&
		ts.isStringLiteral(node.arguments[0]) &&
		node.arguments.length === 1;

	function visit(node: ts.Node): ts.VisitResult<ts.Node> {
		if (isRequire(node) || isAsyncImport(node)) {
			return unpathRequireAndAsyncImport(node);
		}

		if (ts.isExternalModuleReference(node)) {
			return unpathImportEqualsDeclaration(node);
		}

		if (ts.isImportDeclaration(node)) {
			return unpathImportDeclaration(node);
		}

		if (ts.isExportDeclaration(node)) {
			return unpathExportDeclaration(node);
		}

		if (ts.isImportTypeNode(node)) {
			return unpathImportTypeNode(node);
		}

		return ts.visitEachChild(node, visit, context);
	}

	function unpathRequireAndAsyncImport(node: ts.CallExpression) {
		const firstArg = node.arguments[0] as ts.StringLiteral;
		const file = bindModuleToFile(firstArg.text);

		if (!file) {
			return node;
		}

		const fileLiteral = ts.createLiteral(file);

		return ts.updateCall(node, node.expression, node.typeArguments, [fileLiteral]);
	}

	function unpathImportTypeNode(node: ts.ImportTypeNode) {
		const argument = node.argument as ts.LiteralTypeNode;
		const literal = argument.literal;

		if (!ts.isStringLiteral(literal)) {
			return node;
		}

		const file = bindModuleToFile(literal.text);

		if (!file) {
			return node;
		}

		const fileLiteral = ts.createLiteral(file);
		const fileArgument = ts.updateLiteralTypeNode(argument, fileLiteral);

		return ts.updateImportTypeNode(node, fileArgument, node.qualifier, node.typeArguments, node.isTypeOf);
	}

	function unpathImportEqualsDeclaration(node: ts.ExternalModuleReference) {
		if (!ts.isStringLiteral(node.expression)) {
			return node;
		}
		const file = bindModuleToFile(node.expression.text);
		if (!file) {
			return node;
		}
		const fileLiteral = ts.createLiteral(file);

		return ts.updateExternalModuleReference(node, fileLiteral);
	}
	function unpathImportDeclaration(node: ts.ImportDeclaration): ts.VisitResult<ts.Statement> {
		if (!ts.isStringLiteral(node.moduleSpecifier)) {
			return node;
		}
		const file = bindModuleToFile(node.moduleSpecifier.text);
		if (!file) {
			return node;
		}
		const fileLiteral = ts.createLiteral(file);

		const importClause = ts.visitNode(node.importClause, visitImportClause as any, ts.isImportClause);
		return node.importClause === importClause || importClause || isDeclarationFile
			? ts.updateImportDeclaration(node, node.decorators, node.modifiers, node.importClause, fileLiteral)
			: undefined;
	}
	function visitImportClause(node: ts.ImportClause): ts.VisitResult<ts.ImportClause> {
		const name = resolver.isReferencedAliasDeclaration(node) ? node.name : undefined;
		const namedBindings = ts.visitNode(node.namedBindings, visitNamedImportBindings as any, ts.isNamedImports);
		return name || namedBindings ? ts.updateImportClause(node, name, namedBindings, node.isTypeOnly) : undefined;
	}
	function visitNamedImportBindings(node: ts.NamedImportBindings): ts.VisitResult<ts.NamedImportBindings> {
		if (node.kind === ts.SyntaxKind.NamespaceImport) {
			return resolver.isReferencedAliasDeclaration(node) ? node : undefined;
		} else {
			const elements = ts.visitNodes(node.elements, visitImportSpecifier as any, ts.isImportSpecifier);
			return elements.some(e => e) ? ts.updateNamedImports(node, elements) : undefined;
		}
	}
	function visitImportSpecifier(node: ts.ImportSpecifier): ts.VisitResult<ts.ImportSpecifier> {
		return resolver.isReferencedAliasDeclaration(node) ? node : undefined;
	}

	function unpathExportDeclaration(node: ts.ExportDeclaration): ts.VisitResult<ts.Statement> {
		if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
			return node;
		}

		const file = bindModuleToFile(node.moduleSpecifier.text);
		if (!file) {
			return node;
		}
		const fileLiteral = ts.createLiteral(file);

		if (
			(!node.exportClause &&
				!compilerOptions.isolatedModules &&
				!resolver.moduleExportsSomeValue(node.moduleSpecifier)) ||
			(node.exportClause && resolver.isValueAliasDeclaration(node))
		) {
			return ts.updateExportDeclaration(
				node,
				node.decorators,
				node.modifiers,
				node.exportClause,
				fileLiteral,
				node.isTypeOnly,
			);
		}

		const exportClause = ts.visitNode(node.exportClause, visitNamedExports as any, ts.isNamedExports);
		return node.exportClause === exportClause || exportClause || isDeclarationFile
			? ts.updateExportDeclaration(
					node,
					node.decorators,
					node.modifiers,
					node.exportClause,
					fileLiteral,
					node.isTypeOnly,
			  )
			: undefined;
	}
	function visitNamedExports(node: ts.NamedExports): ts.VisitResult<ts.NamedExports> {
		const elements = ts.visitNodes(node.elements, visitExportSpecifier as any, ts.isExportSpecifier);
		return elements.some(e => e) ? ts.updateNamedExports(node, elements) : undefined;
	}
	function visitExportSpecifier(node: ts.ExportSpecifier): ts.VisitResult<ts.ExportSpecifier> {
		return resolver.isValueAliasDeclaration(node) ? node : undefined;
	}

	function fixupImportPath(p: string) {
		let res = normalizePath(p);

		/* Remove implicit extension */
		const ext = extname(res);
		if (ext && implicitExtensions.includes(ext.replace(/^\./, ""))) res = res.slice(0, -ext.length);

		return res;
	}

	return ts.visitNode(sourceFile, visit);
};
