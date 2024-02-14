import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformClassConstructor } from "TSTransformer/nodes/class/transformClassConstructor";
import { transformDecorators } from "TSTransformer/nodes/class/transformDecorators";
import { transformPropertyDeclaration } from "TSTransformer/nodes/class/transformPropertyDeclaration";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformBlock } from "TSTransformer/nodes/statements/transformBlock";
import { transformMethodDeclaration } from "TSTransformer/nodes/transformMethodDeclaration";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { getKindName } from "TSTransformer/util/getKindName";
import { getOriginalSymbolOfNode } from "TSTransformer/util/getOriginalSymbolOfNode";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";
import { validateMethodAssignment } from "TSTransformer/util/validateMethodAssignment";
import ts from "typescript";

const MAGIC_TO_STRING_METHOD = "toString";

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

function createBoilerplate(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	className: luau.Identifier | luau.TemporaryIdentifier,
	isClassExpression: boolean,
) {
	const isAbstract = !!ts.getSelectedSyntacticModifierFlags(node, ts.ModifierFlags.Abstract);
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

	// if a class is abstract and it does not extend any class, it can just be a plain table
	// otherwise we can use the default boilerplate
	const extendsNode = getExtendsNode(node);
	if (isAbstract && !extendsNode) {
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.Assignment, {
				left: className,
				operator: "=",
				right: luau.map(),
			}),
		);
	} else {
		const metatableFields = luau.list.make<luau.MapField>();
		luau.list.push(
			metatableFields,
			luau.create(luau.SyntaxKind.MapField, {
				index: luau.strings.__tostring,
				value: createNameFunction(luau.isTemporaryIdentifier(className) ? "Anonymous" : className.name),
			}),
		);

		if (extendsNode) {
			const [extendsExp, extendsExpPrereqs] = state.capture(() =>
				transformExpression(state, extendsNode.expression),
			);
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

		const metatable = luau.call(luau.globals.setmetatable, [
			luau.map(),
			luau.create(luau.SyntaxKind.Map, { fields: metatableFields }),
		]);

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
				left: luau.property(className, "__index"),
				operator: "=",
				right: className,
			}),
		);
	}

	// statements for className.new
	if (!isAbstract) {
		const statementsInner = luau.list.make<luau.Statement>();

		//	local self = setmetatable({}, className);
		luau.list.push(
			statementsInner,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: luau.globals.self,
				right: luau.call(luau.globals.setmetatable, [luau.map(), className]),
			}),
		);

		//	return self:constructor(...) or self;
		luau.list.push(
			statementsInner,
			luau.create(luau.SyntaxKind.ReturnStatement, {
				expression: luau.binary(
					luau.create(luau.SyntaxKind.MethodCallExpression, {
						expression: luau.globals.self,
						name: "constructor",
						args: luau.list.make(luau.create(luau.SyntaxKind.VarArgsLiteral, {})),
					}),
					"or",
					luau.globals.self,
				),
			}),
		);

		//	function className.new(...)
		//	end;
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.FunctionDeclaration, {
				name: luau.property(className, "new"),
				parameters: luau.list.make(),
				hasDotDotDot: true,
				statements: statementsInner,
				localize: false,
			}),
		);
	}

	return statements;
}

function extendsMacroClass(state: TransformState, node: ts.ClassLikeDeclaration) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
		if (symbol) {
			return (
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ArrayConstructor) ||
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.SetConstructor) ||
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.MapConstructor) ||
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.WeakSetConstructor) ||
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.WeakMapConstructor) ||
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyMapConstructor) ||
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlySetConstructor)
			);
		}
	}
	return false;
}

function isClassHoisted(state: TransformState, node: ts.ClassLikeDeclaration) {
	if (node.name) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.name);
		assert(symbol);
		return state.isHoisted.get(symbol) === true;
	}
	return false;
}

export function transformClassLikeDeclaration(state: TransformState, node: ts.ClassLikeDeclaration) {
	const isClassExpression = ts.isClassExpression(node);
	const statements = luau.list.make<luau.Statement>();

	const isExportDefault = !!ts.getSelectedSyntacticModifierFlags(node, ts.ModifierFlags.ExportDefault);

	if (node.name) {
		validateIdentifier(state, node.name);
	}

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
		returnVar = luau.tempId("class");
	} else if (node.name) {
		returnVar = transformIdentifierDefined(state, node.name);
	} else if (isExportDefault) {
		returnVar = luau.id("default");
	} else {
		returnVar = luau.tempId("class");
	}

	let internalName: luau.Identifier | luau.TemporaryIdentifier;
	if (shouldUseInternalName) {
		internalName = transformIdentifierDefined(state, node.name);
	} else {
		internalName = returnVar;
	}
	state.classIdentifierMap.set(node, internalName);
	if (!isClassHoisted(state, node)) {
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: returnVar,
				right: undefined,
			}),
		);
	}

	if (extendsMacroClass(state, node)) {
		DiagnosticService.addDiagnostic(errors.noMacroExtends(node));
	}

	// OOP boilerplate + class functions
	const statementsInner = luau.list.make<luau.Statement>();
	luau.list.pushList(statementsInner, createBoilerplate(state, node, internalName, isClassExpression));

	luau.list.pushList(statementsInner, transformClassConstructor(state, node, internalName, getConstructor(node)));

	for (const member of node.members) {
		if (
			(ts.isPropertyDeclaration(member) || ts.isMethodDeclaration(member)) &&
			(ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) &&
			luau.isReservedClassField(member.name.text)
		) {
			DiagnosticService.addDiagnostic(errors.noReservedClassFields(member.name));
		}
		if (ts.isAutoAccessorPropertyDeclaration(member)) {
			// member must have AccessorKeyword to be AutoAccessorPropertyDeclaration
			const keyword = ts.getModifiers(member)!.find(m => m.kind === ts.SyntaxKind.AccessorKeyword)!;
			DiagnosticService.addDiagnostic(errors.noAutoAccessorModifiers(keyword));
		}
	}

	const methods = new Array<ts.MethodDeclaration>();
	const staticDeclarations = new Array<ts.PropertyDeclaration | ts.ClassStaticBlockDeclaration>();

	for (const member of node.members) {
		validateMethodAssignment(state, member);
		if (
			ts.isConstructorDeclaration(member) ||
			ts.isIndexSignatureDeclaration(member) ||
			ts.isSemicolonClassElement(member)
		) {
			continue;
		} else if (ts.isMethodDeclaration(member)) {
			methods.push(member);
		} else if (ts.isPropertyDeclaration(member)) {
			// non-static properties are done in transformClassConstructor
			if (!ts.hasStaticModifier(member)) {
				continue;
			}
			staticDeclarations.push(member);
		} else if (ts.isAccessor(member)) {
			DiagnosticService.addDiagnostic(errors.noGetterSetter(member));
		} else if (ts.isClassStaticBlockDeclaration(member)) {
			staticDeclarations.push(member);
		} else {
			assert(false, `ClassMember kind not implemented: ${getKindName(member.kind)}`);
		}
	}

	const classType = state.typeChecker.getTypeOfSymbolAtLocation(node.symbol, node);
	const instanceType = state.typeChecker.getDeclaredTypeOfSymbol(node.symbol);

	for (const method of methods) {
		if (ts.isIdentifier(method.name) || ts.isStringLiteral(method.name)) {
			if (luau.isMetamethod(method.name.text)) {
				DiagnosticService.addDiagnostic(errors.noClassMetamethods(method.name));
			}

			if (!!ts.getSelectedSyntacticModifierFlags(method, ts.ModifierFlags.Static)) {
				if (instanceType.getProperty(method.name.text) !== undefined) {
					DiagnosticService.addDiagnostic(errors.noInstanceMethodCollisions(method));
				}
			} else {
				if (classType.getProperty(method.name.text) !== undefined) {
					DiagnosticService.addDiagnostic(errors.noStaticMethodCollisions(method));
				}
			}
		}

		luau.list.pushList(
			statementsInner,
			transformMethodDeclaration(state, method, { name: "name", value: internalName }),
		);
	}

	const toStringProperty = instanceType.getProperty(MAGIC_TO_STRING_METHOD);
	if (toStringProperty && !!(toStringProperty.flags & ts.SymbolFlags.Method)) {
		luau.list.push(
			statementsInner,
			luau.create(luau.SyntaxKind.MethodDeclaration, {
				expression: internalName,
				name: "__tostring",
				hasDotDotDot: false,
				parameters: luau.list.make(),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.ReturnStatement, {
						expression: luau.create(luau.SyntaxKind.MethodCallExpression, {
							expression: luau.globals.self,
							name: MAGIC_TO_STRING_METHOD,
							args: luau.list.make(),
						}),
					}),
				),
			}),
		);
	}

	for (const declaration of staticDeclarations) {
		if (ts.isClassStaticBlockDeclaration(declaration)) {
			luau.list.pushList(statementsInner, transformBlock(state, declaration.body));
		} else {
			luau.list.pushList(statementsInner, transformPropertyDeclaration(state, declaration, internalName));
		}
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

	luau.list.pushList(statementsInner, transformDecorators(state, node, returnVar));

	luau.list.push(
		statements,
		luau.create(luau.SyntaxKind.DoStatement, {
			statements: statementsInner,
		}),
	);

	return { statements, name: returnVar };
}
