import * as ts from "ts-morph";
import { transpileStatementedNode } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
// import { isRbxService } from "../typeUtilities";
import { getScriptContext, getScriptType, ScriptType } from "../utility";

type importSpecifierConstraint = (a: ts.ImportSpecifier) => boolean;

export function prioritizeImportsByCondition(node: ts.SourceFile, condition: importSpecifierConstraint) {
	const meetsCondition = new Array<[ts.ImportDeclaration, number]>();
	const otherImports = new Array<[ts.ImportDeclaration, number]>();

	const importDeclarations = node.getImportDeclarations();

	console.log("Hello, world!");

	for (let i = 0; i < importDeclarations.length; i++) {
		const importDeclaration = importDeclarations[i];
		if (importDeclaration.getNamedImports().some(condition)) {
			meetsCondition.push([importDeclaration, i]);
		} else {
			otherImports.push([importDeclaration, i]);
		}
	}

	// Switch imports with an RbxService type to the top
	if (meetsCondition.length > 0 && otherImports.length > 0) {
		const limit = Math.min(otherImports.length, meetsCondition.length);

		for (let i = 0; i < limit; i++) {
			const a = otherImports[i][0].getText();
			const b = meetsCondition[i][0].getText();

			otherImports[i][0].replaceWithText(b);
			meetsCondition[i][0].replaceWithText(a);
		}
	}
}

export function transpileSourceFile(state: TranspilerState, node: ts.SourceFile) {
	state.scriptContext = getScriptContext(node);
	const scriptType = getScriptType(node);
	// prioritizeImportsByCondition(node, (namedImport) => isRbxService(namedImport.getType().getText()))
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
