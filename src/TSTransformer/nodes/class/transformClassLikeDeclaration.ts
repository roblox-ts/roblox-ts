import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import {
	transformClassConstructor,
	transformImplicitClassConstructor,
} from "TSTransformer/nodes/class/transformClassConstructor";
import { transformDecorators } from "TSTransformer/nodes/class/transformDecorators";
import { transformPropertyDeclaration } from "TSTransformer/nodes/class/transformPropertyDeclaration";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformBlock } from "TSTransformer/nodes/statements/transformBlock";
import { transformMethodDeclaration } from "TSTransformer/nodes/transformMethodDeclaration";
import { findConstructor } from "TSTransformer/util/findConstructor";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { getKindName } from "TSTransformer/util/getKindName";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";
import { validateMethodAssignment } from "TSTransformer/util/validateMethodAssignment";
import ts from "typescript";

const MAGIC_TO_STRING_METHOD = "toString";

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
	const isAbstract = ts.hasAbstractModifier(node);
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

	const isExportDefault = ts.hasSyntacticModifier(node, ts.ModifierFlags.ExportDefault);

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

	// OOP boilerplate + class functions
	const statementsInner = luau.list.make<luau.Statement>();
	luau.list.pushList(statementsInner, createBoilerplate(state, node, internalName, isClassExpression));

	const constructor = findConstructor(node);
	if (constructor) {
		luau.list.pushList(statementsInner, transformClassConstructor(state, constructor, internalName));
	} else {
		luau.list.pushList(statementsInner, transformImplicitClassConstructor(state, node, internalName));
	}

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

			if (ts.hasStaticModifier(method)) {
				if (instanceType.getProperty(method.name.text) !== undefined) {
					DiagnosticService.addDiagnostic(errors.noInstanceMethodCollisions(method));
				}
			} else {
				if (classType.getProperty(method.name.text) !== undefined) {
					DiagnosticService.addDiagnostic(errors.noStaticMethodCollisions(method));
				}
			}
		}

		const [statements, prereqs] = state.capture(() =>
			transformMethodDeclaration(state, method, { name: "name", value: internalName }),
		);
		luau.list.pushList(statementsInner, prereqs);
		luau.list.pushList(statementsInner, statements);
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
			const [statements, prereqs] = state.capture(() =>
				transformPropertyDeclaration(state, declaration, internalName),
			);
			luau.list.pushList(statementsInner, prereqs);
			luau.list.pushList(statementsInner, statements);
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
