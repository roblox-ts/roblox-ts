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
import { transformMethodDeclaration } from "TSTransformer/nodes/transformMethodDeclaration";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { extendsRoactComponent } from "TSTransformer/util/extendsRoactComponent";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { getKindName } from "TSTransformer/util/getKindName";
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
				right: luau.mixedTable(),
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
			const extendsDec = getExtendsDeclaration(state, extendsNode.expression);
			if (extendsDec && extendsRoactComponent(state, extendsDec)) {
				DiagnosticService.addDiagnostic(errors.noRoactInheritance(node));
			}

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
		const aliasSymbol = state.getType(extendsNode.expression).symbol;
		if (aliasSymbol) {
			const originalSymbol = ts.skipAlias(aliasSymbol, state.typeChecker);
			return (
				originalSymbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ArrayConstructor) ||
				originalSymbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.SetConstructor) ||
				originalSymbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.MapConstructor) ||
				originalSymbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.WeakSetConstructor) ||
				originalSymbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.WeakMapConstructor) ||
				originalSymbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyMapConstructor) ||
				originalSymbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlySetConstructor)
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
		internalName = node.name ? transformIdentifierDefined(state, node.name) : luau.tempId("class");
	} else {
		internalName = returnVar;
	}

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

	const isRoact = extendsRoactComponent(state, node);

	// OOP boilerplate + class functions
	const statementsInner = luau.list.make<luau.Statement>();
	if (isRoact) {
		luau.list.pushList(statementsInner, createRoactBoilerplate(state, node, internalName, isClassExpression));
	} else {
		luau.list.pushList(statementsInner, createBoilerplate(state, node, internalName, isClassExpression));
	}

	luau.list.pushList(statementsInner, transformClassConstructor(state, node, internalName, getConstructor(node)));

	for (const member of node.members) {
		if (
			(ts.isPropertyDeclaration(member) || ts.isMethodDeclaration(member)) &&
			(ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) &&
			(luau.isReservedClassField(member.name.text) ||
				(isRoact && luau.isReservedRoactClassField(member.name.text)))
		) {
			DiagnosticService.addDiagnostic(errors.noReservedClassFields(member.name));
		}
	}

	const classType = state.typeChecker.getTypeOfSymbolAtLocation(node.symbol, node);
	const instanceType = state.typeChecker.getDeclaredTypeOfSymbol(node.symbol);

	for (const member of node.members) {
		if (ts.isMethodDeclaration(member)) {
			if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
				if (luau.isMetamethod(member.name.text)) {
					DiagnosticService.addDiagnostic(errors.noClassMetamethods(member.name));
				}

				if (!!ts.getSelectedSyntacticModifierFlags(member, ts.ModifierFlags.Static)) {
					if (instanceType.getProperty(member.name.text) !== undefined) {
						DiagnosticService.addDiagnostic(errors.noInstanceMethodCollisions(member));
					}
				} else {
					if (classType.getProperty(member.name.text) !== undefined) {
						DiagnosticService.addDiagnostic(errors.noStaticMethodCollisions(member));
					}
				}
			}

			luau.list.pushList(
				statementsInner,
				transformMethodDeclaration(state, member, { name: "name", value: internalName }),
			);
		}
	}

	for (const member of node.members) {
		validateMethodAssignment(state, member);
		if (
			// handled above
			ts.isConstructorDeclaration(member) ||
			// type-only, nothing to emit
			ts.isIndexSignatureDeclaration(member) ||
			// does nothing
			ts.isSemicolonClassElement(member) ||
			// handled above
			ts.isMethodDeclaration(member)
		) {
			continue;
		} else if (ts.isPropertyDeclaration(member)) {
			// Non-static properties are handled in constructor
			if (ts.hasStaticModifier(member)) {
				luau.list.pushList(statementsInner, transformPropertyDeclaration(state, member, internalName));
			}
		} else if (ts.isClassStaticBlockDeclaration(member)) {
			const staticBlockStatements = luau.list.make<luau.Statement>(
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: luau.globals.self,
					right: internalName,
				}),
			);
			luau.list.pushList(staticBlockStatements, transformStatementList(state, member.body.statements));
			luau.list.push(
				statementsInner,
				luau.create(luau.SyntaxKind.DoStatement, {
					statements: staticBlockStatements,
				}),
			);
		} else if (ts.isAccessor(member)) {
			DiagnosticService.addDiagnostic(errors.noGetterSetter(member));
		} else {
			assert(false, `Class member type not implemented: ${getKindName(member.kind)}`);
		}
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
