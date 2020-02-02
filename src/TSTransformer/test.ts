import { TransformState } from "TSTransformer";
import { transformSourceFile } from "TSTransformer/nodes/sourceFile";
import ts from "typescript";
import { renderAST } from "LuaRenderer";

const sourceFile = ts.createSourceFile(
	"test.ts",
	"const x = 1; const y = 2; const z = 3;",
	ts.ScriptTarget.ES2017,
	true,
	ts.ScriptKind.TS,
);

const luaAST = transformSourceFile(new TransformState(), sourceFile);
const luaSource = renderAST(luaAST);

console.log(luaSource);
