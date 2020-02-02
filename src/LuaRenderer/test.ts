import * as fs from "fs";
import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer/RenderState";
import { renderStatements } from "LuaRenderer/util/statements";
import * as path from "path";

const ast = lua.list.make<lua.Statement>();

lua.list.push(ast, lua.comment("Case #1"));
lua.list.push(ast, lua.call(lua.parentheses(lua.func())));
lua.list.push(ast, lua.call(lua.parentheses(lua.func())));
lua.list.push(ast, lua.comment("Case #2"));
lua.list.push(ast, lua.call(lua.callExp(lua.callExp(lua.parentheses(lua.func())), [lua.func()])));

const luaSource = renderStatements(new RenderState(), ast);
fs.writeFileSync(path.resolve(__dirname, "..", "..", "out.lua"), luaSource);
