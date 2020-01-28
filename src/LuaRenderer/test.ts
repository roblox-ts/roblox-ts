import * as fs from "fs";
import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer/RenderState";
import { renderStatements } from "LuaRenderer/util/statements";
import * as path from "path";

const ast = lua.list.make<lua.Statement>();

lua.list.push(ast, lua.comment("HttpResponse"));
lua.list.push(ast, lua.comment("Encapsulates the response from an http request. Nothing fancy"));
lua.list.push(ast, lua.varDec("HttpResponse", lua.table()));
lua.list.push(
	ast,
	lua.create(lua.SyntaxKind.FunctionDeclaration, {
		name: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression: lua.id("HttpResponse"),
			name: lua.id("new"),
		}),
		args: lua.list.make(
			lua.id("response"),
			lua.id("responseTime"),
			lua.id("statusCode"),
			lua.id("requestType"),
			lua.id("url"),
		),
		hasVarArgs: false,
		statements: lua.list.make(
			lua.create(lua.SyntaxKind.ReturnStatement, {
				expression: lua.map([
					[lua.string("responseTimeMs"), lua.id("responseTime")],
					[lua.string("responseCode"), lua.id("statusCode")],
					[lua.string("responseBody"), lua.id("response")],
					[lua.string("requestType"), lua.id("requestType")],
					[lua.string("url"), lua.id("url")],
				]),
			}),
		),
	}),
);
lua.list.push(ast, lua.create(lua.SyntaxKind.ReturnStatement, { expression: lua.id("HttpResponse") }));

const luaSource = renderStatements(new RenderState(), ast);
fs.writeFileSync(path.resolve(__dirname, "..", "..", "out.lua"), luaSource);
