import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformClassConstructor } from "TSTransformer/nodes/class/transformClassConstructor";
import { transformClassElement } from "TSTransformer/nodes/class/transformClassElement";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";

function hasConstructor(node: ts.ClassLikeDeclaration) {
	return node.members.some(element => ts.isConstructorDeclaration(element));
}

function needsConstructor(node: ts.ClassLikeDeclaration) {
	return node.members.some(element => ts.isPropertyDeclaration(element) && element.initializer);
}

function createNameFunction(name: string) {
	return lua.create(lua.SyntaxKind.FunctionExpression, {
		statements: lua.list.make(
			lua.create(lua.SyntaxKind.ReturnStatement, {
				expression: lua.string(name),
			}),
		),
		parameters: lua.list.make(),
		hasDotDotDot: false,
	});
}

function createBoilerplate(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	className: lua.Identifier | lua.TemporaryIdentifier,
	isClassExpression: boolean,
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
		lua.create(isClassExpression && node.name ? lua.SyntaxKind.VariableDeclaration : lua.SyntaxKind.Assignment, {
			left: isClassExpression && node.name ? transformIdentifierDefined(state, node.name) : className,
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

	// statements for className.new
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
		(needsConstructor(node) || hasConstructor(node)) &&
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
	const isClassExpression = ts.isClassExpression(node);
	const statements = lua.list.make<lua.Statement>();
	/*
		local className;
		do
			OOP boilerplate
			class functions
		end
	*/
	const shouldUseInternalName = isClassExpression && node.name !== undefined;
	const returnVar = shouldUseInternalName
		? lua.tempId()
		: node.name
		? transformIdentifierDefined(state, node.name)
		: lua.tempId();
	const internalName = shouldUseInternalName
		? node.name
			? transformIdentifierDefined(state, node.name)
			: lua.tempId()
		: returnVar;
	lua.list.push(
		statements,
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: returnVar,
			right: undefined,
		}),
	);

	// OOP boilerplate + class functions
	const statementsInner = lua.list.make<lua.Statement>();
	lua.list.pushList(statementsInner, createBoilerplate(state, node, internalName, isClassExpression));
	if (!hasConstructor(node) && needsConstructor(node)) {
		lua.list.pushList(statementsInner, transformClassConstructor(state, node.members, { value: internalName }));
	}
	for (const member of node.members) {
		lua.list.pushList(statementsInner, transformClassElement(state, member, { value: internalName }));
	}
	// if using internal name, assign to return var
	shouldUseInternalName &&
		lua.list.push(
			statementsInner,
			lua.create(lua.SyntaxKind.Assignment, {
				left: returnVar,
				right: internalName,
			}),
		);
	lua.list.push(
		statements,
		lua.create(lua.SyntaxKind.DoStatement, {
			statements: statementsInner,
		}),
	);

	return { statements, name: returnVar };
}
