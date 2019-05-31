import RojoProject from "rojo-utils";
import * as ts from "ts-morph";
import { compileStatementedNode } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { ProjectType } from "../Project";
import { isRbxService } from "../typeUtilities";
import { getScriptContext, getScriptType, ScriptType, transformPathToLua } from "../utility";

const { version: VERSION } = require("./../../package.json") as {
	version: string;
};

export function compileSourceFile(state: CompilerState, node: ts.SourceFile) {
	console.profile(node.getBaseName());

	state.scriptContext = getScriptContext(node);
	const scriptType = getScriptType(node);
	let result = compileStatementedNode(state, node);
	if (state.isModule) {
		if (scriptType !== ScriptType.Module) {
			throw new CompilerError(
				"Attempted to export in a non-ModuleScript!",
				node,
				CompilerErrorType.ExportInNonModuleScript,
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
		let link: string;
		if (state.projectInfo.type === ProjectType.Package) {
			link = `_G[script];`;
		} else if (state.projectInfo.type === ProjectType.Game) {
			const runtimeLibPath = [...state.projectInfo.runtimeLibPath];
			const service = runtimeLibPath.shift()!;
			if (!isRbxService(service)) {
				throw new CompilerError(
					`"${service}" is not a valid Roblox Service!`,
					node,
					CompilerErrorType.InvalidService,
				);
			}
			link = `game:GetService("${service}")` + runtimeLibPath.map(v => `:WaitForChild("${v}")`).join("");
		} else if (state.projectInfo.type === ProjectType.Bundle) {
			const rbxPath = state.rojoProject!.getRbxFromFile(
				transformPathToLua(state.rootDirPath, state.outDirPath, node.getFilePath()),
			).path;
			if (!rbxPath) {
				throw new CompilerError(
					`Bundle could not resolve runtime library location!`,
					node,
					CompilerErrorType.BadRojo,
				);
			}
			const rbxRelative = RojoProject.relative(rbxPath, state.projectInfo.runtimeLibPath);
			let start = "script";
			while (rbxRelative[0] === "..") {
				rbxRelative.shift();
				start += ".Parent";
			}
			link = [start, ...rbxRelative].join(".");
		}
		result = `local TS = require(${link!});\n` + result;
	}

	const CURRENT_TIME = new Date().toLocaleString("en-US", {
		day: "numeric",
		hour: "numeric",
		hour12: true,
		minute: "numeric",
		month: "long",
		timeZoneName: "long",
		year: "numeric",
	});

	const GENERATED_HEADER = `-- Compiled with https://roblox-ts.github.io v${VERSION}
-- ${CURRENT_TIME}

`;

	result = GENERATED_HEADER + result;
	console.profileEnd();
	return result;
}
