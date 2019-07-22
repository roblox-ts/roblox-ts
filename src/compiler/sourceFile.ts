import * as ts from "ts-morph";
import { compileStatementedNode } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { ProjectType } from "../Project";
import { RojoProject } from "../RojoProject";
import { isRbxService } from "../typeUtilities";
import { getScriptContext, getScriptType, ScriptType, transformPathToLua } from "../utility";

const { version: VERSION } = require("./../../package.json") as {
	version: string;
};

function getRuntimeLibraryStatement(state: CompilerState, node: ts.SourceFile) {
	if (state.runtimeOverride) {
		return state.runtimeOverride.trim() + "\n";
	}

	let link: string;
	if (state.projectType === ProjectType.Package) {
		link = `_G[script]`;
	} else if (state.projectType === ProjectType.Game) {
		const runtimeLibPath = [...state.runtimeLibPath];
		const service = runtimeLibPath.shift()!;
		if (!isRbxService(service)) {
			throw new CompilerError(
				`"${service}" is not a valid Roblox Service!`,
				node,
				CompilerErrorType.InvalidService,
			);
		}
		const path = `game:GetService("${service}")` + runtimeLibPath.map(v => `:WaitForChild("${v}")`).join("");
		link = `require(${path})`;
	} else if (state.projectType === ProjectType.Bundle) {
		const rbxPath = state.rojoProject!.getRbxFromFile(
			transformPathToLua(state.rootPath, state.outPath, node.getFilePath()),
		).path;
		if (!rbxPath) {
			throw new CompilerError(
				`Bundle could not resolve runtime library location!`,
				node,
				CompilerErrorType.BadRojo,
			);
		}
		const rbxRelative = RojoProject.relative(rbxPath, state.runtimeLibPath);
		let start = "script";
		while (rbxRelative[0] === "..") {
			rbxRelative.shift();
			start += ".Parent";
		}
		const path = [start, ...rbxRelative].join(".");
		link = `require(${path})`;
	}
	return `local TS = ${link!};\n`;
}

export function compileSourceFile(state: CompilerState, node: ts.SourceFile) {
	console.profile(node.getBaseName());

	state.scriptContext = getScriptContext(node);
	const scriptType = getScriptType(node);
	let result = compileStatementedNode(state, node);
	/* istanbul ignore else */
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
			/* istanbul ignore else */
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

	/* istanbul ignore next */
	if (state.usesTSLibrary) {
		result = getRuntimeLibraryStatement(state, node) + result;
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
