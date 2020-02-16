import fs from "fs";
import * as lua from "LuaAST";
import { renderAST } from "LuaRenderer";
import os from "os";
import path from "path";
import { formatDiagnostics } from "Shared/util/formatDiagnostics";
import { TransformState } from "TSTransformer";
import { transformSourceFile } from "TSTransformer/nodes/transformSourceFile";
import ts from "typescript";

const FILE_NAME = "test.ts";
const tsSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "input")).toString();
const sourceFile = ts.createSourceFile(FILE_NAME, tsSource, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);

const program = ts.createProgram({
	options: {
		downlevelIteration: true,
		module: ts.ModuleKind.CommonJS,
		noLib: true,
		strict: true,
		target: ts.ScriptTarget.ESNext,
		allowSyntheticDefaultImports: true,
		isolatedModules: true,
	},
	rootNames: [FILE_NAME],
	host: {
		fileExists: fileName => fileName === FILE_NAME,
		getSourceFile: fileName => (fileName === FILE_NAME ? sourceFile : undefined),
		readFile: () => undefined,
		getDefaultLibFileName: () => "",
		writeFile: () => {},
		getCurrentDirectory: () => "/",
		getCanonicalFileName: fileName => fileName,
		useCaseSensitiveFileNames: () => true,
		getNewLine: () => os.EOL,
	},
});

const preEmitDiagnostics = ts.getPreEmitDiagnostics(program, sourceFile);
if (preEmitDiagnostics.length > 0) {
	console.log(formatDiagnostics(preEmitDiagnostics));
}

const state = new TransformState(program.getTypeChecker(), sourceFile);
const luaAST = transformSourceFile(state, sourceFile);
fs.writeFileSync(path.resolve(__dirname, "..", "..", "ast.json"), lua.visualizeAST(luaAST));

if (state.diagnostics.length > 0) {
	console.log(formatDiagnostics(state.diagnostics).replace(/TS roblox\-ts/g, "roblox-ts"));
	process.exit(1);
}

const luaSource = renderAST(luaAST);
fs.writeFileSync(path.resolve(__dirname, "..", "..", "out.lua"), luaSource);
