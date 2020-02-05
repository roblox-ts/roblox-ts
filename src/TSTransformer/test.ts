import fs from "fs";
import * as lua from "LuaAST";
import { renderAST } from "LuaRenderer";
import os from "os";
import path from "path";
import { TransformState } from "TSTransformer";
import { transformSourceFile } from "TSTransformer/nodes/sourceFile";
import ts from "typescript";

const FILE_NAME = "test.ts";
const tsSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "input")).toString();

const sourceFile = ts.createSourceFile(FILE_NAME, tsSource, ts.ScriptTarget.ES2017);

const program = ts.createProgram({
	options: ts.getDefaultCompilerOptions(),
	rootNames: ["test.ts"],
	host: {
		fileExists(fileName) {
			return fileName === FILE_NAME;
		},

		getSourceFile: fileName => {
			if (fileName === FILE_NAME) {
				return sourceFile;
			}
		},
		readFile: () => undefined,
		getDefaultLibFileName: () => "",
		writeFile: () => {},
		getCurrentDirectory: () => "/",
		getCanonicalFileName: fileName => fileName,
		useCaseSensitiveFileNames: () => true,
		getNewLine: () => os.EOL,
	},
});

const luaAST = transformSourceFile(new TransformState(program.getTypeChecker()), sourceFile);

fs.writeFileSync(path.resolve(__dirname, "..", "..", "ast.json"), lua.visualizeAST(luaAST));

const luaSource = renderAST(luaAST);
fs.writeFileSync(path.resolve(__dirname, "..", "..", "out.lua"), luaSource);
