import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";
import { transformClassConstructor } from "TSTransformer/nodes/class/transformClassConstructor";
import { transformPropertyDeclaration } from "TSTransformer/nodes/class/transformPropertyDeclaration";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformMethodDeclaration } from "TSTransformer/nodes/transformMethodDeclaration";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { extendsRoactComponent } from "TSTransformer/util/extendsRoactComponent";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";

function getConstructor(node: ts.ClassLikeDeclaration): (ts.ConstructorDeclaration & { body: ts.Block }) | undefined {
	return node.members.find(
		(element): element is ts.ConstructorDeclaration & { body: ts.Block } =>
			ts.isConstructorDeclaration(element) && element.body !== undefined,
	);
}

function createNameFunction(name: string) {
	return luau.create(luau.SyntaxKind.FunctionExpression, {
		statements: luau.list.make(
			luau.create(luau.SyntaxKind.ReturnStatement, {
				expression: luau.string(name),
			}),
		),
		parameters: luau.list.make(),
		hasDotDotDot: false,
	});
}

function createRoactBoilerplate(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	className: luau.Identifier | luau.TemporaryIdentifier,
	isClassExpression: boolean,
) {
	const extendsNode = getExtendsNode(node);
	assert(extendsNode);

	const statements = luau.list.make<luau.Statement>();

	const [extendsExp, extendsExpPrereqs] = state.capture(() => transformExpression(state, extendsNode.expression));
	luau.list.pushList(statements, extendsExpPrereqs);

	const classNameStr = luau.isIdentifier(className) ? className.name : "Anonymous";

	const right = luau.create(luau.SyntaxKind.MethodCallExpression, {
		expression: convertToIndexableExpression(extendsExp),
		name: "extend",
		args: luau.list.make(luau.string(classNameStr)),
	});

	if (isClassExpression && node.name) {
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: transformIdentifierDefined(state, node.name),
				right,
			}),
		);
	} else {
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.Assignment, {
				left: className,
				operator: "=",
				right,
			}),
		);
	}

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
	className: luau.Identifier | luau.TemporaryIdentifier,
	isClassExpression: boolean,
) {
	const statements = luau.list.make<luau.Statement>();

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

	const metatableFields = luau.list.make<luau.MapField>();
	luau.list.push(
		metatableFields,
		luau.create(luau.SyntaxKind.MapField, {
			index: luau.strings.__tostring,
			value: createNameFunction(luau.isTemporaryIdentifier(className) ? "Anonymous" : className.name),
		}),
	);

	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const extendsDec = getExtendsDeclaration(state, extendsNode.expression);
		if (extendsDec && extendsRoactComponent(state, extendsDec)) {
			state.addDiagnostic(diagnostics.noRoactInheritance(node));
		}

		const [extendsExp, extendsExpPrereqs] = state.capture(() => transformExpression(state, extendsNode.expression));
		const superId = luau.id("super");
		luau.list.pushList(statements, extendsExpPrereqs);
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: superId,
				right: extendsExp,
			}),
		);
		luau.list.push(
			metatableFields,
			luau.create(luau.SyntaxKind.MapField, {
				index: luau.strings.__index,
				value: superId,
			}),
		);
	}

	const metatable = luau.create(luau.SyntaxKind.CallExpression, {
		expression: luau.globals.setmetatable,
		args: luau.list.make(luau.map(), luau.create(luau.SyntaxKind.Map, { fields: metatableFields })),
	});

	if (isClassExpression && node.name) {
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: transformIdentifierDefined(state, node.name),
				right: metatable,
			}),
		);
	} else {
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.Assignment, {
				left: className,
				operator: "=",
				right: metatable,
			}),
		);
	}

	//	className.__index = className;
	luau.list.push(
		statements,
		luau.create(luau.SyntaxKind.Assignment, {
			left: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
				name: "__index",
				expression: className,
			}),
			operator: "=",
			right: className,
		}),
	);

	const statementsInner = luau.list.make<luau.Statement>();

	// statements for className.new
	//	local self = setmetatable({}, className);
	luau.list.push(
		statementsInner,
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: luau.globals.self,
			right: luau.create(luau.SyntaxKind.CallExpression, {
				expression: luau.globals.setmetatable,
				args: luau.list.make<luau.Expression>(luau.map(), className),
			}),
		}),
	);

	//	self:constructor(...);
	luau.list.push(
		statementsInner,
		luau.create(luau.SyntaxKind.CallStatement, {
			expression: luau.create(luau.SyntaxKind.MethodCallExpression, {
				expression: luau.globals.self,
				name: "constructor",
				args: luau.list.make(luau.create(luau.SyntaxKind.VarArgsLiteral, {})),
			}),
		}),
	);

	//	return self;
	luau.list.push(
		statementsInner,
		luau.create(luau.SyntaxKind.ReturnStatement, {
			expression: luau.globals.self,
		}),
	);

	//	function className.new(...)
	//	end;
	luau.list.push(
		statements,
		luau.create(luau.SyntaxKind.FunctionDeclaration, {
			name: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
				expression: className,
				name: "new",
			}),
			parameters: luau.list.make(),
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
	const statements = luau.list.make<luau.Statement>();

	const isExportDefault = !!(node.modifierFlagsCache & ts.ModifierFlags.ExportDefault);

	/*
		local className;
		do
			OOP boilerplate
			class functions
		end
	*/

	const shouldUseInternalName = isClassExpression && node.name !== undefined;

	let returnVar: luau.Identifier | luau.TemporaryIdentifier;
	if (shouldUseInternalName) {
		returnVar = luau.tempId();
	} else if (node.name) {
		returnVar = transformIdentifierDefined(state, node.name);
	} else if (isExportDefault) {
		returnVar = luau.id("default");
	} else {
		returnVar = luau.tempId();
	}

	let internalName: luau.Identifier | luau.TemporaryIdentifier;
	if (shouldUseInternalName) {
		internalName = node.name ? transformIdentifierDefined(state, node.name) : luau.tempId();
	} else {
		internalName = returnVar;
	}

	luau.list.push(
		statements,
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: returnVar,
			right: undefined,
		}),
	);

	if (extendsMacroClass(state, node)) {
		state.addDiagnostic(diagnostics.noMacroExtends(node));
	}

	// OOP boilerplate + class functions
	const statementsInner = luau.list.make<luau.Statement>();
	if (extendsRoactComponent(state, node)) {
		luau.list.pushList(statementsInner, createRoactBoilerplate(state, node, internalName, isClassExpression));
	} else {
		luau.list.pushList(statementsInner, createBoilerplate(state, node, internalName, isClassExpression));
	}

	luau.list.pushList(
		statementsInner,
		transformClassConstructor(state, node, { value: internalName }, getConstructor(node)),
	);

	const methods = new Array<ts.MethodDeclaration>();
	const staticProperties = new Array<ts.PropertyDeclaration>();
	for (const member of node.members) {
		if (
			ts.isConstructorDeclaration(member) ||
			ts.isIndexSignatureDeclaration(member) ||
			ts.isSemicolonClassElement(member)
		) {
			continue;
		} else if (ts.isMethodDeclaration(member)) {
			methods.push(member);
		} else if (ts.isPropertyDeclaration(member)) {
			// do not emit non-static properties here
			if (!ts.hasStaticModifier(member)) {
				continue;
			}
			staticProperties.push(member);
		} else if (ts.isAccessor(member)) {
			state.addDiagnostic(diagnostics.noGetterSetter(member));
		} else {
			assert(false, "Not implemented!");
		}
	}

	for (const method of methods) {
		luau.list.pushList(statementsInner, transformMethodDeclaration(state, method, { value: internalName }));
	}

	for (const property of staticProperties) {
		luau.list.pushList(statementsInner, transformPropertyDeclaration(state, property, { value: internalName }));
	}

	// if using internal name, assign to return var
	if (shouldUseInternalName) {
		luau.list.push(
			statementsInner,
			luau.create(luau.SyntaxKind.Assignment, {
				left: returnVar,
				operator: "=",
				right: internalName,
			}),
		);
	}

	luau.list.push(
		statements,
		luau.create(luau.SyntaxKind.DoStatement, {
			statements: statementsInner,
		}),
	);

	return { statements, name: returnVar };
}
