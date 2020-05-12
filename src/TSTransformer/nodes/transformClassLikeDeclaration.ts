import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer/TransformState";
import { transformClassElement } from "TSTransformer/nodes/statements/transformClassElement";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";

const hasConstructor = (node: ts.ClassLikeDeclaration) =>
	node.members.some(element => ts.isConstructorDeclaration(element));

const createNameFunction = (name: string) =>
	lua.create(lua.SyntaxKind.FunctionExpression, {
		statements: lua.list.make(
			lua.create(lua.SyntaxKind.ReturnStatement, {
				expression: lua.string(name),
			}),
		),
		parameters: lua.list.make(),
		hasDotDotDot: false,
	});

function createBoilerplate(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	className: lua.Identifier | lua.TemporaryIdentifier,
) {
	const statements = lua.list.make<lua.Statement>();
	/* boilerplate:
		className = setmetatable({}, {
			__tostring = function() return "className" end;
		});
		className.__index = className;
		function className.new(...)
			local self = setmetatable({}, className);
			self:constructor(...);
			return self;
		end;
		function className:constructor()
		end;
	*/

	// 	className = setmetatable({}, {
	// 		__tostring = function() return "className" end;
	//	});
	lua.list.push(
		statements,
		lua.create(lua.SyntaxKind.Assignment, {
			left: className,
			right: lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.setmetatable,
				args: lua.list.make(
					lua.map(),
					lua.map([
						[
							lua.string("__tostring"),
							createNameFunction(lua.isTemporaryIdentifier(className) ? "Anonymous" : className.name),
						],
					]),
				),
			}),
		}),
	);

	//	className.__index = className;
	lua.list.push(
		statements,
		lua.create(lua.SyntaxKind.Assignment, {
			left: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
				name: "__index",
				expression: className,
			}),
			right: className,
		}),
	);

	const statementsInner = lua.list.make<lua.Statement>();

	{
		//	local self = setmetatable({}, className);
		lua.list.push(
			statementsInner,
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: lua.globals.self,
				right: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.setmetatable,
					args: lua.list.make<lua.Expression>(lua.map(), className),
				}),
			}),
		);

		//	self:constructor(...);
		// if there is no constructor, don't call it
		// no method for this... discussion on discord about it

		hasConstructor(node) &&
			lua.list.push(
				statementsInner,
				lua.create(lua.SyntaxKind.CallStatement, {
					expression: lua.create(lua.SyntaxKind.MethodCallExpression, {
						expression: lua.globals.self,
						name: "constructor",
						args: lua.list.make(lua.create(lua.SyntaxKind.VarArgsLiteral, {})),
					}),
				}),
			);

		//	return self;
		lua.list.push(
			statementsInner,
			lua.create(lua.SyntaxKind.ReturnStatement, {
				expression: lua.globals.self,
			}),
		);
	}
	//	function className.new(...)
	//	end;
	lua.list.push(
		statements,
		lua.create(lua.SyntaxKind.FunctionDeclaration, {
			name: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
				expression: className,
				name: "new",
			}),
			parameters: lua.list.make(),
			hasDotDotDot: true,
			statements: statementsInner,
			localize: false,
		}),
	);

	return statements;
}

export function transformClassLikeDeclaration(state: TransformState, node: ts.ClassLikeDeclaration) {
	const statements = lua.list.make<lua.Statement>();
	/*
		local className;
		do
			OOP boilerplate
			class functions
		end
	*/
	const name = node.name ? transformIdentifierDefined(state, node.name) : lua.tempId();
	lua.list.push(
		statements,
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: name,
			right: undefined,
		}),
	);

	// OOP boilerplate + class functions
	const statementsInner = lua.list.make<lua.Statement>();
	lua.list.pushList(statementsInner, createBoilerplate(state, node, name));
	for (const member of node.members) {
		lua.list.pushList(statementsInner, transformClassElement(state, member, { value: name }));
	}
	lua.list.push(
		statements,
		lua.create(lua.SyntaxKind.DoStatement, {
			statements: statementsInner,
		}),
	);

	return { statements, name };
}
