import * as ts from "ts-morph";
import { transpileStatementedNode } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { isRbxService } from "../typeUtilities";
import { getScriptContext, getScriptType, ScriptType } from "../utility";

// import { yellow } from "../utility";
export function transpileSourceFile(state: TranspilerState, node: ts.SourceFile) {
	state.scriptContext = getScriptContext(node);
	const scriptType = getScriptType(node);

	const serviceImports = new Array<[ts.ImportDeclaration, number]>();
	const nonServiceImports = new Array<[ts.ImportDeclaration, number]>();

	const importDeclarations = node.getImportDeclarations();

	for (let i = 0; i < importDeclarations.length; i++) {
		const importDeclaration = importDeclarations[i];
		if (importDeclaration.getNamedImports().some(namedImport => isRbxService(namedImport.getType().getText()))) {
			serviceImports.push([importDeclaration, i]);
		} else {
			nonServiceImports.push([importDeclaration, i]);
		}
	}

	// Switch imports with an RbxService type to the top
	if (serviceImports.length > 0 && nonServiceImports.length > 0) {
		serviceImports.sort((a, b) => a[1] - b[1]);
		nonServiceImports.sort((a, b) => a[1] - b[1]);

		const limit = Math.min(nonServiceImports.length, serviceImports.length);

		for (let i = 0; i < limit; i++) {
			const a = nonServiceImports[i][0].getText();
			const b = serviceImports[i][0].getText();

			nonServiceImports[i][0].replaceWithText(b);
			serviceImports[i][0].replaceWithText(a);
		}
	}

	let result = transpileStatementedNode(state, node);
	if (state.isModule) {
		if (scriptType !== ScriptType.Module) {
			throw new TranspilerError(
				"Attempted to export in a non-ModuleScript!",
				node,
				TranspilerErrorType.ExportInNonModuleScript,
			);
		}

		let hasExportEquals = false;
		for (const descendant of node.getDescendantsOfKind(ts.SyntaxKind.ExportAssignment)) {
			if (hasExportEquals) {
				throw new TranspilerError(
					"ModuleScript contains multiple ExportEquals. You can only do `export = ` once.",
					node,
					TranspilerErrorType.MultipleExportEquals,
				);
			}
			if (descendant.isExportEquals()) {
				hasExportEquals = true;
			}
		}

		if (hasExportEquals) {
			result = state.indent + `local _exports;\n` + result;
		} else {
			result = state.indent + `local _exports = {};\n` + result;
		}
		result += state.indent + "return _exports;\n";
	} else {
		if (scriptType === ScriptType.Module) {
			result += state.indent + "return nil;\n";
		}
	}
	if (state.usesTSLibrary) {
		result =
			state.indent +
			`local TS = require(
	game:GetService("ReplicatedStorage")
		:WaitForChild("RobloxTS")
		:WaitForChild("Include")
		:WaitForChild("RuntimeLib")
);\n` +
			result;
	}
	return result;
}
