import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";
import { transformClassConstructor } from "TSTransformer/nodes/class/transformClassConstructor";
import { transformClassElement } from "TSTransformer/nodes/class/transformClassElement";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { extendsRoactComponent } from "TSTransformer/util/extendsRoactComponent";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";

function hasConstructor(node: ts.ClassLikeDeclaration) {
	return node.members.some(element => ts.isConstructorDeclaration(element) && element.body !== undefined);
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

function createRoactBoilerplate(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	className: lua.Identifier | lua.TemporaryIdentifier,
	isClassExpression: boolean,
) {
	const extendsNode = getExtendsNode(node);
	assert(extendsNode, "Roact class did not extends from anything");

	const statements = lua.list.make<lua.Statement>();

	const { expression: extendsExp, statements: extendsExpPrereqs } = state.capture(() =>
		transformExpression(state, extendsNode.expression),
	);
	lua.list.pushList(statements, extendsExpPrereqs);

	const classNameStr = lua.isIdentifier(className) ? className.name : "Anonymous";

	lua.list.push(
		statements,
		lua.create(isClassExpression && node.name ? lua.SyntaxKind.VariableDeclaration : lua.SyntaxKind.Assignment, {
			left: isClassExpression && node.name ? transformIdentifierDefined(state, node.name) : className,
			right: lua.create(lua.SyntaxKind.MethodCallExpression, {
				expression: convertToIndexableExpression(extendsExp),
				name: "extend",
				args: lua.list.make(lua.string(classNameStr)),
			}),
		}),
	);

	return statements;
}

function getExtendsDeclaration(state: TransformState, extendsExp: ts.Expression) {
	if (ts.isClassLike(extendsExp)) {
		return extendsExp;
	}
	const symbol = state.typeChecker.getSymbolAtLocation(extendsExp);
	if (symbol && symbol.valueDeclaration && ts.isClassLike(symbol.valueDeclaration)) {
		return symbol.valueDeclaration;
	}
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
	// 		__index = super,
	//	});

	const metatableFields = lua.list.make<lua.MapField>();
	lua.list.push(
		metatableFields,
		lua.create(lua.SyntaxKind.MapField, {
			index: lua.strings.__tostring,
			value: createNameFunction(lua.isTemporaryIdentifier(className) ? "Anonymous" : className.name),
		}),
	);

	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const extendsDec = getExtendsDeclaration(state, extendsNode.expression);
		if (extendsDec && extendsRoactComponent(state, extendsDec)) {
			state.addDiagnostic(diagnostics.noRoactInheritance(node));
		}

		const { expression: extendsExp, statements: extendsExpPrereqs } = state.capture(() =>
			transformExpression(state, extendsNode.expression),
		);
		const superId = lua.id("super");
		lua.list.pushList(statements, extendsExpPrereqs);
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: superId,
				right: extendsExp,
			}),
		);
		lua.list.push(
			metatableFields,
			lua.create(lua.SyntaxKind.MapField, {
				index: lua.strings.__index,
				value: superId,
			}),
		);
	}

	lua.list.push(
		statements,
		lua.create(isClassExpression && node.name ? lua.SyntaxKind.VariableDeclaration : lua.SyntaxKind.Assignment, {
			left: isClassExpression && node.name ? transformIdentifierDefined(state, node.name) : className,
			right: lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.setmetatable,
				args: lua.list.make(lua.map(), lua.create(lua.SyntaxKind.Map, { fields: metatableFields })),
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

function extendsMacroClass(state: TransformState, node: ts.ClassLikeDeclaration) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const aliasSymbol = state.getType(extendsNode.expression).symbol;
		if (aliasSymbol) {
			const originalSymbol = ts.skipAlias(aliasSymbol, state.typeChecker);
			return (
				originalSymbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ArrayConstructor) ||
				originalSymbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.SetConstructor) ||
				originalSymbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.MapConstructor) ||
				originalSymbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.WeakSetConstructor) ||
				originalSymbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.WeakMapConstructor) ||
				originalSymbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyMapConstructor) ||
				originalSymbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlySetConstructor)
			);
		}
	}
	return false;
}

export function transformClassLikeDeclaration(state: TransformState, node: ts.ClassLikeDeclaration) {
	const isClassExpression = ts.isClassExpression(node);
	const statements = lua.list.make<lua.Statement>();

	const isExportDefault = !!(node.modifierFlagsCache & ts.ModifierFlags.ExportDefault);

	/*
		local className;
		do
			OOP boilerplate
			class functions
		end
	*/

	const shouldUseInternalName = isClassExpression && node.name !== undefined;

	let returnVar: lua.Identifier | lua.TemporaryIdentifier;
	if (shouldUseInternalName) {
		returnVar = lua.tempId();
	} else if (node.name) {
		returnVar = transformIdentifierDefined(state, node.name);
	} else if (isExportDefault) {
		returnVar = lua.id("default");
	} else {
		returnVar = lua.tempId();
	}

	let internalName: lua.Identifier | lua.TemporaryIdentifier;
	if (shouldUseInternalName) {
		internalName = node.name ? transformIdentifierDefined(state, node.name) : lua.tempId();
	} else {
		internalName = returnVar;
	}

	lua.list.push(
		statements,
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: returnVar,
			right: undefined,
		}),
	);

	if (extendsMacroClass(state, node)) {
		state.addDiagnostic(diagnostics.noMacroExtends(node));
	}

	// OOP boilerplate + class functions
	const statementsInner = lua.list.make<lua.Statement>();
	if (extendsRoactComponent(state, node)) {
		lua.list.pushList(statementsInner, createRoactBoilerplate(state, node, internalName, isClassExpression));
	} else {
		lua.list.pushList(statementsInner, createBoilerplate(state, node, internalName, isClassExpression));
	}
	if (!hasConstructor(node)) {
		lua.list.pushList(
			statementsInner,
			transformClassConstructor(state, node, node.members, { value: internalName }),
		);
	}
	for (const member of node.members) {
		lua.list.pushList(statementsInner, transformClassElement(state, member, { value: internalName }));
	}

	// if using internal name, assign to return var
	if (shouldUseInternalName) {
		lua.list.push(
			statementsInner,
			lua.create(lua.SyntaxKind.Assignment, {
				left: returnVar,
				right: internalName,
			}),
		);
	}

	lua.list.push(
		statements,
		lua.create(lua.SyntaxKind.DoStatement, {
			statements: statementsInner,
		}),
	);

	return { statements, name: returnVar };
}
