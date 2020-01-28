import * as fs from "fs";
import * as path from "path";
import * as lua from "../LuaAST";
import { RenderState } from "../LuaRenderer/RenderState";
import { renderStatements } from "../LuaRenderer/util/statements";

const ast = lua.list.make<lua.Statement>();

lua.list.push(ast, lua.varDec("Workspace", lua.methodCallExp(lua.id("game"), "GetService", [lua.string("Workspace")])));

lua.list.push(
	ast,
	lua.create(lua.SyntaxKind.IfStatement, {
		condition: lua.bool(true),
		statements: lua.list.make(lua.call(lua.id("print"), [lua.number(1), lua.number(2), lua.number(3)])),
		elseBody: lua.create(lua.SyntaxKind.IfStatement, {
			condition: lua.bool(true),
			statements: lua.list.make(lua.call(lua.id("print"), [lua.number(1), lua.number(2), lua.number(3)])),
			elseBody: lua.create(lua.SyntaxKind.IfStatement, {
				condition: lua.bool(true),
				statements: lua.list.make(lua.call(lua.id("print"), [lua.number(1), lua.number(2), lua.number(3)])),
				elseBody: lua.list.make(lua.call(lua.id("print"), [lua.number(1), lua.number(2), lua.number(3)])),
			}),
		}),
	}),
);

lua.list.push(
	ast,
	lua.whileDo(lua.bool(true), [lua.call(lua.id("print"), [lua.number(1), lua.number(2), lua.number(3)])]),
);

lua.list.push(
	ast,
	lua.funcDec("foo", [lua.id("bar")], false, [
		lua.varDec("Workspace", lua.methodCallExp(lua.id("game"), "GetService", [lua.string("Workspace")])),
	]),
);

lua.list.push(ast, lua.call(lua.id("print"), []));
lua.list.push(ast, lua.call(lua.parentheses(lua.id("print")), []));

lua.list.push(ast, lua.comment("foobar!"));

lua.list.push(ast, lua.methodCall(lua.string("foo"), "bar", []));

const luaSource = renderStatements(new RenderState(), ast);
fs.writeFileSync(path.resolve(__dirname, "..", "out.lua"), luaSource);
