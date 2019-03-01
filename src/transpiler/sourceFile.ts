import * as ts from "ts-morph";
import { transpileStatementedNode } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { getScriptContext, getScriptType, ScriptType } from "../utility";

export function transpileSourceFile(state: TranspilerState, node: ts.SourceFile) {
	state.scriptContext = getScriptContext(node);
	const scriptType = getScriptType(node);
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
			if (descendant.isExportEquals()) {
				hasExportEquals = true;
				break;
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
			`local TS = require(
	game:GetService("ReplicatedStorage")
		:WaitForChild("RobloxTS")
		:WaitForChild("Include")
		:WaitForChild("RuntimeLib")
);\n` + result;
	}
	return result;
}
