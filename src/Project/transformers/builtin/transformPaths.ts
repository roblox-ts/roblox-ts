/* eslint-disable -- file copied from other source and best not to be touched */

// modified version of https://github.com/LeDDGroup/typescript-transform-paths/blob/34e49639f7248e38475efd854670c11ea65fc76e/src/index.ts

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

import path from "path";
import ts from "typescript";
import url from "url";

/* ****************************************************************************************************************** */
// region: Types
/* ****************************************************************************************************************** */

export interface TsTransformPathsConfig {
	useRootDirs?: boolean;
}

// endregion

/* ****************************************************************************************************************** */
// region: Helpers
/* ****************************************************************************************************************** */

const getImplicitExtensions = (options: ts.CompilerOptions) => {
	let res: string[] = [".ts", ".d.ts"];

	let { allowJs, jsx, resolveJsonModule: allowJson } = options;
	const allowJsx = !!jsx && <any>jsx !== ts.JsxEmit.None;

	allowJs && res.push(".js");
	allowJsx && res.push(".tsx");
	allowJs && allowJsx && res.push(".jsx");
	allowJson && res.push(".json");

	return res;
};

const isURL = (s: string): boolean => !!s && (!!url.parse(s).host || !!url.parse(s).hostname);
const isBaseDir = (base: string, dir: string) => path.relative(base, dir)?.[0] !== ".";

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

// endregion

/* ****************************************************************************************************************** *
 * Transformer
 * ****************************************************************************************************************** */

export default function transformer(program: ts.Program, config: TsTransformPathsConfig) {
	const { useRootDirs } = config;
	const compilerOptions = program.getCompilerOptions();
	const implicitExtensions = getImplicitExtensions(compilerOptions);

	return (context: ts.TransformationContext) => (sourceFile: ts.SourceFile | ts.Bundle) => {
		if (ts.isBundle(sourceFile)) return sourceFile;

		const factory = context.factory;

		const { fileName } = sourceFile;
		const fileDir = ts.normalizePath(path.dirname(fileName));
		if (!compilerOptions.baseUrl && !compilerOptions.paths) return sourceFile;

		let rootDirs = compilerOptions.rootDirs?.filter(path.isAbsolute);

		return ts.visitEachChild(sourceFile, visit, context);

		/* ********************************************************* *
		 * Transformer Helpers
		 * ********************************************************* */

		/**
		 * Gets proper path and calls updaterFn to update the node
		 */
		function update(
			original: ts.Node,
			moduleName: string,
			updaterFn: (newPath: ts.StringLiteral) => ts.Node,
		): ts.Node {
			let p: string;

			/* Have Compiler API attempt to resolve */
			const { resolvedModule, failedLookupLocations } = ts.resolveModuleName(
				moduleName,
				fileName,
				compilerOptions,
				ts.sys,
			);

			if (!resolvedModule) {
				const maybeURL = failedLookupLocations![0];
				if (!isURL(maybeURL)) return original;
				p = maybeURL;
			} else if (resolvedModule.isExternalLibraryImport) return original;
			else {
				const { extension, resolvedFileName } = resolvedModule;

				let filePath = fileDir;
				let modulePath = path.dirname(resolvedFileName);

				/* Handle rootDirs mapping */
				if (useRootDirs && rootDirs) {
					let fileRootDir = "";
					let moduleRootDir = "";
					for (const rootDir of rootDirs) {
						if (isBaseDir(rootDir, resolvedFileName) && rootDir.length > moduleRootDir.length)
							moduleRootDir = rootDir;
						if (isBaseDir(rootDir, fileName) && rootDir.length > fileRootDir.length) fileRootDir = rootDir;
					}

					/* Remove base dirs to make relative to root */
					if (fileRootDir && moduleRootDir) {
						filePath = path.relative(fileRootDir, filePath);
						modulePath = path.relative(moduleRootDir, modulePath);
					}
				}

				/* Remove extension if implicit */
				p = ts.normalizePath(path.join(path.relative(filePath, modulePath), path.basename(resolvedFileName)));
				if (extension && implicitExtensions.includes(extension)) p = p.slice(0, -extension.length);
				if (!p) return original;

				p = p[0] === "." ? p : `./${p}`;
			}

			const newStringLiteral = factory.createStringLiteral(p);
			return updaterFn(newStringLiteral);
		}

		/**
		 * Visit and replace nodes with module specifiers
		 */
		function visit(node: ts.Node): ts.Node | undefined {
			/* Update require() or import() */
			if (isRequire(node) || isAsyncImport(node))
				return update(node, (<ts.StringLiteral>node.arguments[0]).text, p => {
					const res = factory.updateCallExpression(node, node.expression, node.typeArguments, [p]);

					const textNode = node.arguments[0];
					const commentRanges = ts.getLeadingCommentRanges(textNode.getFullText(), 0) || [];

					for (const range of commentRanges) {
						const { kind, pos, end, hasTrailingNewLine } = range;

						const caption = textNode
							.getFullText()
							.substr(pos, end)
							.replace(
								/* searchValue */ kind === ts.SyntaxKind.MultiLineCommentTrivia
									? // Comment range in a multi-line comment with more than one line erroneously includes the
										// node's text in the range. For that reason, we use the greedy selector in capture group
										// and dismiss anything after the final comment close tag
										/^\/\*(.+)\*\/.*/s
									: /^\/\/(.+)/s,
								/* replaceValue */ "$1",
							);
						ts.addSyntheticLeadingComment(p, kind, caption, hasTrailingNewLine);
					}
					return res;
				});

			/* Update ExternalModuleReference - import foo = require("foo"); */
			if (ts.isExternalModuleReference(node) && ts.isStringLiteral(node.expression))
				return update(node, node.expression.text, p => factory.updateExternalModuleReference(node, p));

			/**
			 * Update ImportDeclaration / ExportDeclaration
			 * import ... 'module';
			 * export ... 'module';
			 *
			 * This implements a workaround for the following TS issues:
			 * @see https://github.com/microsoft/TypeScript/issues/40603
			 * @see https://github.com/microsoft/TypeScript/issues/31446
			 */
			if (
				(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
				node.moduleSpecifier &&
				ts.isStringLiteral(node.moduleSpecifier)
			)
				return update(node, node.moduleSpecifier.text, p => {
					const newNode = factory.cloneNode(node.moduleSpecifier!) as ts.StringLiteral;
					ts.setSourceMapRange(newNode, ts.getSourceMapRange(node));
					ts.setTextRange(newNode, node.moduleSpecifier);
					newNode.text = p.text;

					return Object.assign(node, { moduleSpecifier: newNode });
				});

			/* Update ImportTypeNode - typeof import("./bar"); */
			if (ts.isImportTypeNode(node)) {
				const argument = node.argument as ts.LiteralTypeNode;
				if (!ts.isStringLiteral(argument.literal)) return node;
				const { text } = argument.literal;

				return !text
					? node
					: update(node, text, p =>
							factory.updateImportTypeNode(
								node,
								factory.updateLiteralTypeNode(argument, p),
								node.attributes,
								node.qualifier,
								node.typeArguments,
								node.isTypeOf,
							),
						);
			}

			return ts.visitEachChild(node, visit, context);
		}
	};
}
