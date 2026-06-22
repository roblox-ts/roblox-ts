import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { findConstructor } from "TSTransformer/util/findConstructor";
import { isMethodFromType } from "TSTransformer/util/isMethod";
import ts from "typescript";
import { transformCallSignature, transformType } from "../types/transformType";
import { transformClassConstructorType, transformImplicitClassConstructorType } from "./transformClassConstructorType";

export function transformClassLikeDeclarationType(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	name: luau.Identifier,
): [luau.List<luau.Statement>, luau.TypeIdentifier, luau.TypeIdentifier] {
	// TODO
	const typeName = name.name;
	const classType = state.getType(node);
	const staticClassType = state.typeChecker.getTypeOfSymbol(classType.symbol);

	const typeIdentifier = luau.create(luau.SyntaxKind.TypeIdentifier, {
		module: undefined,
		name: typeName,
	});

	const typeImplIdentifier = luau.create(luau.SyntaxKind.TypeIdentifier, {
		module: undefined,
		name: `${typeName}Impl`,
	});

	const staticTypeDeclarations = luau.list.make<luau.TypeMixedTableField | luau.TypeMixedTableIndexedField>();
	const propertyTypeDeclarations = luau.list.make<luau.TypeMixedTableField | luau.TypeMixedTableIndexedField>();

	// for (const member of node.members) {
	// 	if (ts.isMethodDeclaration(member)) {
	// 		luau.list.push(staticTypeDeclarations, luau.create(luau.SyntaxKind.TypeMixedTableField, {
	// 			index: luau.create(luau.SyntaxKind.TypeIdentifier, {
	// 				module: undefined,
	// 				name: member.name.getText()
	// 			}),
	// 			value: transformCallSignature(state, state.getType(member), member, typeIdentifier) ?? luau.any(),
	// 		}));
	// 	}

	// 	if (ts.isPropertyDeclaration(member)) {
	// 		luau.list.push(ts.hasStaticModifier(member) ? staticTypeDeclarations : propertyTypeDeclarations, luau.create(luau.SyntaxKind.TypeMixedTableField, {
	// 			index: luau.create(luau.SyntaxKind.TypeIdentifier, {
	// 				module: undefined,
	// 				name: member.name.getText()
	// 			}),
	// 			value: transformType(state, state.getType(member), member) ?? luau.any(),
	// 		}));
	// 	}
	// }

	for (const property of classType.getProperties() ?? []) {
		const member = state.typeChecker.getTypeOfSymbol(property);
		if (isMethodFromType(state, node, member)) {
			luau.list.push(
				staticTypeDeclarations,
				luau.create(luau.SyntaxKind.TypeMixedTableField, {
					index: luau.create(luau.SyntaxKind.TypeIdentifier, {
						module: undefined,
						name: property.getName(),
					}),
					value: transformCallSignature(state, member, node, typeIdentifier) ?? luau.any(),
				}),
			);
			continue;
		}

		luau.list.push(
			propertyTypeDeclarations,
			luau.create(luau.SyntaxKind.TypeMixedTableField, {
				index: luau.create(luau.SyntaxKind.TypeIdentifier, {
					module: undefined,
					name: property.getName(),
				}),
				value: transformType(state, member, node) ?? luau.any(),
			}),
		);
	}

	for (const property of staticClassType.getProperties() ?? []) {
		const member = state.typeChecker.getTypeOfSymbol(property);
		if (isMethodFromType(state, node, member)) {
			luau.list.push(
				staticTypeDeclarations,
				luau.create(luau.SyntaxKind.TypeMixedTableField, {
					index: luau.create(luau.SyntaxKind.TypeIdentifier, {
						module: undefined,
						name: property.getName(),
					}),
					value: transformCallSignature(state, member, node, typeImplIdentifier) ?? luau.any(),
				}),
			);
			continue;
		}

		luau.list.push(
			staticTypeDeclarations,
			luau.create(luau.SyntaxKind.TypeMixedTableField, {
				index: luau.create(luau.SyntaxKind.TypeIdentifier, {
					module: undefined,
					name: property.getName(),
				}),
				value: transformType(state, member, node) ?? luau.any(),
			}),
		);
	}

	luau.list.push(
		staticTypeDeclarations,
		luau.create(luau.SyntaxKind.TypeMixedTableField, {
			index: luau.create(luau.SyntaxKind.TypeIdentifier, {
				module: undefined,
				name: luau.strings.__index.value,
			}),
			value: typeImplIdentifier,
		}),
	);

	const isAbstract = ts.hasAbstractModifier(node);
	if (!isAbstract) {
		const constructor = findConstructor(node);
		if (constructor) {
			luau.list.push(
				staticTypeDeclarations,
				luau.create(luau.SyntaxKind.TypeMixedTableField, {
					index: luau.typeId("new"),
					value: transformClassConstructorType(state, constructor, typeIdentifier),
				}),
			);
		} else {
			luau.list.push(
				staticTypeDeclarations,
				luau.create(luau.SyntaxKind.TypeMixedTableField, {
					index: luau.typeId("new"),
					value: transformImplicitClassConstructorType(state, node, typeIdentifier),
				}),
			);
		}

		luau.list.push(
			staticTypeDeclarations,
			luau.create(luau.SyntaxKind.TypeMixedTableField, {
				index: luau.typeId("constructor"),
				value: luau.create(luau.SyntaxKind.TypeFunction, {
					parameters: luau.list.make(
						luau.create(luau.SyntaxKind.TypeParameter, {
							name: "self",
							value: typeIdentifier,
						}),
					),
					dotDotDot: luau.any(),
					returnType: luau.any(),
				}),
			}),
		);
	}

	let impl: luau.TypeExpression = luau.create(luau.SyntaxKind.TypeMixedTable, {
		fields: staticTypeDeclarations,
	});

	// This causes autocomplete to break in Luau
	// This probably isn't worth the benefit of being 100% correct - all that's missing is __tostring
	// const extendsNode = getExtendsNode(node);
	// if (!(isAbstract && !extendsNode)) {
	// 	impl = luau.create(luau.SyntaxKind.TypeTypeOf, {
	// 		expression: luau.call(luau.globals.setmetatable, [
	// 			luau.cast(
	// 				luau.map(),
	// 				impl,
	// 			),
	// 			luau.cast(
	// 				luau.map(),
	// 				luau.create(luau.SyntaxKind.TypeMixedTable, {
	// 					fields: luau.list.make(
	// 						luau.create(luau.SyntaxKind.TypeMixedTableField, {
	// 							index: luau.typeId("__tostring"),
	// 							value: luau.create(luau.SyntaxKind.TypeFunction, {
	// 								parameters: luau.list.make(
	// 									// luau.create(luau.SyntaxKind.TypeParameter, {
	// 									// 	name: undefined,
	// 									// 	value: typeImplIdentifier
	// 									// })
	// 								),
	// 								dotDotDot: undefined,
	// 								returnType: luau.typeId("string"),
	// 							})
	// 						})
	// 					)
	// 				}),
	// 			),
	// 		])
	// 	});
	// }

	const instance = luau.create(luau.SyntaxKind.TypeTypeOf, {
		expression: luau.call(luau.globals.setmetatable, [
			luau.cast(
				luau.map(),
				luau.create(luau.SyntaxKind.TypeMixedTable, {
					fields: propertyTypeDeclarations,
				}),
			),
			luau.cast(luau.cast(luau.map(), luau.any()), typeImplIdentifier),
		]),
	});

	return [
		luau.list.make(
			luau.create(luau.SyntaxKind.TypeStatement, {
				identifier: typeImplIdentifier,
				expression: impl,
			}),
			luau.create(luau.SyntaxKind.TypeStatement, {
				identifier: typeIdentifier,
				expression: instance,
			}),
		),
		typeImplIdentifier,
		typeIdentifier,
	];
}
