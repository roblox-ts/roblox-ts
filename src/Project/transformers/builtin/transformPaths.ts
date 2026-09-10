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

const getImplicitExtensions = (options: ts.CompilerOptions) => {
	const res: Array<string> = [".ts", ".d.ts"];

	const { allowJs, jsx, resolveJsonModule: allowJson } = options;
	const allowJsx = jsx !== undefined && jsx !== ts.JsxEmit.None;

	if (allowJs) {
		res.push(".js");
	}
	if (allowJsx) {
		res.push(".tsx");
	}
	if (allowJs && allowJsx) {
		res.push(".jsx");
	}
	if (allowJson) {
		res.push(".json");
	}

	return res;
};

// eslint-disable-next-line @typescript-eslint/no-deprecated -- preserve legacy URL recognition for TypeScript's failed lookup paths
const isURL = (s: string): boolean => !!s && !!url.parse(s).host;

export default function transformer(program: ts.Program) {
	const compilerOptions = program.getCompilerOptions();
	const implicitExtensions = getImplicitExtensions(compilerOptions);

	return (context: ts.TransformationContext) => (sourceFile: ts.SourceFile | ts.Bundle) => {
		if (ts.isBundle(sourceFile)) {
			return sourceFile;
		}

		const factory = context.factory;

		const { fileName } = sourceFile;
		const fileDir = ts.normalizePath(path.dirname(fileName));
		if (!compilerOptions.baseUrl && !compilerOptions.paths) {
			return sourceFile;
		}

		return ts.visitEachChild(sourceFile, visit, context);

		/**
		 * gets the resolved declaration path before replacing its module specifier
		 */
		function update(
			original: ts.Node,
			moduleName: string,
			updaterFn: (newPath: ts.StringLiteral) => ts.Node,
		): ts.Node {
			let p: string;

			/* resolve using the same options as the source program */
			const { resolvedModule, failedLookupLocations } = ts.resolveModuleName(
				moduleName,
				fileName,
				compilerOptions,
				ts.sys,
			);

			if (!resolvedModule) {
				const maybeURL = failedLookupLocations![0];
				if (!isURL(maybeURL)) {
					return original;
				}
				p = maybeURL;
			} else if (resolvedModule.isExternalLibraryImport) {
				return original;
			} else {
				const { extension, resolvedFileName } = resolvedModule;

				const filePath = fileDir;
				const modulePath = path.dirname(resolvedFileName);

				/* omit extensions that TypeScript resolves implicitly */
				p = ts.normalizePath(path.join(path.relative(filePath, modulePath), path.basename(resolvedFileName)));
				if (implicitExtensions.includes(extension)) {
					p = p.slice(0, -extension.length);
				}
				if (!p) {
					return original;
				}

				p = p[0] === "." ? p : `./${p}`;
			}

			const newStringLiteral = factory.createStringLiteral(p);
			return updaterFn(newStringLiteral);
		}

		/**
		 * visit and replace nodes with module specifiers
		 */
		function visit(node: ts.Node): ts.Node | undefined {
			/* update ExternalModuleReference - import foo = require("foo"); */
			if (ts.isExternalModuleReference(node) && ts.isStringLiteral(node.expression)) {
				return update(node, node.expression.text, p => factory.updateExternalModuleReference(node, p));
			}

			/**
			 * update ImportDeclaration / ExportDeclaration
			 * import ... 'module';
			 * export ... 'module';
			 *
			 * this implements a workaround for the following TS issues:
			 * @see https://github.com/microsoft/TypeScript/issues/40603
			 * @see https://github.com/microsoft/TypeScript/issues/31446
			 */
			if (
				(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
				node.moduleSpecifier &&
				ts.isStringLiteral(node.moduleSpecifier)
			) {
				return update(node, node.moduleSpecifier.text, p => {
					const newNode = factory.createStringLiteral(p.text);
					ts.setSourceMapRange(newNode, ts.getSourceMapRange(node));
					ts.setTextRange(newNode, node.moduleSpecifier);

					return ts.isImportDeclaration(node)
						? factory.updateImportDeclaration(
								node,
								node.modifiers,
								node.importClause,
								newNode,
								node.attributes,
							)
						: factory.updateExportDeclaration(
								node,
								node.modifiers,
								node.isTypeOnly,
								node.exportClause,
								newNode,
								node.attributes,
							);
				});
			}

			/* update ImportTypeNode - typeof import("./bar"); */
			if (ts.isImportTypeNode(node)) {
				const argument = node.argument as ts.LiteralTypeNode;
				if (!ts.isStringLiteral(argument.literal)) {
					return node;
				}
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
