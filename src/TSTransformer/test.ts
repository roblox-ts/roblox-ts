import fs from "fs";
import { renderAST } from "LuaRenderer";
import path from "path";
import { TransformState } from "TSTransformer";
import { transformSourceFile } from "TSTransformer/nodes/sourceFile";
import ts from "typescript";

const sourceFile = ts.createSourceFile(
	"test.ts",
	fs.readFileSync(path.resolve(__dirname, "..", "..", "input")).toString(),
	ts.ScriptTarget.ES2017,
);

const luaAST = transformSourceFile(new TransformState(), sourceFile);
const luaSource = renderAST(luaAST);

fs.writeFileSync(path.resolve(__dirname, "..", "..", "out.lua"), luaSource);
