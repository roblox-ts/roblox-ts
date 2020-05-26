import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { ROACT_SYMBOL_NAMES } from "TSTransformer/classes/RoactSymbolManager";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { binaryExpressionChain, propertyAccessExpressionChain } from "TSTransformer/util/expressionChain";
import {
	assignToMapPointer,
	assignToMixedTablePointer,
	createMapPointer,
	createMixedTablePointer,
	disableMapInline,
	disableMixedTableInline,
	MapPointer,
	MixedTablePointer,
} from "TSTransformer/util/pointer";
import { isArrayType, isMapType } from "TSTransformer/util/types";

function Roact(...indices: Array<string>) {
	return propertyAccessExpressionChain(lua.id("Roact"), indices);
}

function transformJsxTagNameExpression(state: TransformState, node: ts.JsxTagNameExpression) {
	if (ts.isIdentifier(node)) {
		const symbol = state.typeChecker.getSymbolAtLocation(node);
		if (symbol) {
			const className = state.roactSymbolManager.getIntrinsicElementClassNameFromSymbol(symbol);
			if (className !== undefined) {
				return lua.string(className);
			}
		}
	}

	if (ts.isPropertyAccessExpression(node)) {
		if (ts.isPrivateIdentifier(node.name)) {
			state.addDiagnostic(diagnostics.noPrivateIdentifier(node.name));
		}
		return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression: convertToIndexableExpression(transformExpression(state, node.expression)),
			name: node.name.text,
		});
	} else {
		return transformExpression(state, node);
	}
}

function transformJsxInitializer(state: TransformState, initializer: ts.Expression | undefined) {
	if (initializer && ts.isJsxExpression(initializer)) {
		initializer = initializer.expression;
	}
	if (initializer) {
		return state.capture(() => transformExpression(state, initializer!));
	} else {
		return {
			expression: lua.bool(true),
			statements: lua.list.make<lua.Statement>(),
		};
	}
}

function getAttributes(node: ts.JsxElement | ts.JsxSelfClosingElement) {
	if (ts.isJsxElement(node)) {
		return node.openingElement.attributes;
	} else {
		return node.attributes;
	}
}

function createJsxAttributeLoop(attributesPtrValue: lua.AnyIdentifier, expression: lua.Expression) {
	const keyId = lua.tempId();
	const valueId = lua.tempId();
	return lua.create(lua.SyntaxKind.ForStatement, {
		ids: lua.list.make(keyId, valueId),
		expression: lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.pairs,
			args: lua.list.make(expression),
		}),
		statements: lua.list.make(
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: attributesPtrValue,
					index: keyId,
				}),
				right: valueId,
			}),
		),
	});
}

/** `children[lengthId + keyId] = valueId` */
function createJsxAddNumericChild(
	childrenPtrValue: lua.AnyIdentifier,
	lengthId: lua.AnyIdentifier,
	key: lua.Expression,
	value: lua.Expression,
) {
	return lua.create(lua.SyntaxKind.Assignment, {
		left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: childrenPtrValue,
			index: lua.create(lua.SyntaxKind.BinaryExpression, {
				left: lengthId,
				operator: "+",
				right: key,
			}),
		}),
		right: value,
	});
}

/** `children[keyId] = valueId` */
function createJsxAddKeyChild(
	childrenPtrValue: lua.AnyIdentifier,
	keyId: lua.TemporaryIdentifier,
	valueId: lua.TemporaryIdentifier,
) {
	return lua.create(lua.SyntaxKind.Assignment, {
		left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: childrenPtrValue,
			index: keyId,
		}),
		right: valueId,
	});
}

function createJsxAddNumericChildren(
	childrenPtrValue: lua.AnyIdentifier,
	lengthId: lua.AnyIdentifier,
	expression: lua.Expression,
) {
	const keyId = lua.tempId();
	const valueId = lua.tempId();
	return lua.create(lua.SyntaxKind.ForStatement, {
		ids: lua.list.make(keyId, valueId),
		expression: lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.pairs,
			args: lua.list.make(expression),
		}),
		statements: lua.list.make(createJsxAddNumericChild(childrenPtrValue, lengthId, keyId, valueId)),
	});
}

function createJsxAddAmbiguousChildren(
	childrenPtrValue: lua.AnyIdentifier,
	lengthId: lua.AnyIdentifier,
	expression: lua.Expression,
) {
	const keyId = lua.tempId();
	const valueId = lua.tempId();
	return lua.create(lua.SyntaxKind.ForStatement, {
		ids: lua.list.make(keyId, valueId),
		expression: lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.pairs,
			args: lua.list.make(expression),
		}),
		statements: lua.list.make<lua.Statement>(
			lua.create(lua.SyntaxKind.IfStatement, {
				// type(keyId) == "string"
				condition: lua.create(lua.SyntaxKind.BinaryExpression, {
					left: lua.create(lua.SyntaxKind.CallExpression, {
						expression: lua.globals.type,
						args: lua.list.make(keyId),
					}),
					operator: "==",
					right: lua.strings.number,
				}),
				statements: lua.list.make(createJsxAddNumericChild(childrenPtrValue, lengthId, keyId, valueId)),
				elseBody: lua.list.make(createJsxAddKeyChild(childrenPtrValue, keyId, valueId)),
			}),
		),
	});
}

function createJsxAddAmbiguousChild(
	childrenPtrValue: lua.AnyIdentifier,
	amtChildrenSinceUpdate: number,
	lengthId: lua.AnyIdentifier,
	expression: lua.IndexableExpression,
) {
	return lua.create(lua.SyntaxKind.IfStatement, {
		condition: binaryExpressionChain(
			[
				lua.create(lua.SyntaxKind.BinaryExpression, {
					left: lua.create(lua.SyntaxKind.CallExpression, {
						expression: lua.globals.type,
						args: lua.list.make(expression),
					}),
					operator: "==",
					right: lua.strings.table,
				}),
				lua.create(lua.SyntaxKind.BinaryExpression, {
					left: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
						expression,
						name: "props",
					}),
					operator: "~=",
					right: lua.nil(),
				}),
				lua.create(lua.SyntaxKind.BinaryExpression, {
					left: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
						expression,
						name: "component",
					}),
					operator: "~=",
					right: lua.nil(),
				}),
			],
			"and",
		),
		statements: lua.list.make(
			createJsxAddNumericChild(childrenPtrValue, lengthId, lua.number(amtChildrenSinceUpdate + 1), expression),
		),
		elseBody: lua.list.make(createJsxAddAmbiguousChildren(childrenPtrValue, lengthId, expression)),
	});
}

// maybe unnecessary?
function transformJsxTagName(state: TransformState, tagName: ts.JsxTagNameExpression) {
	const tagNameCaptures = state.capture(() => transformJsxTagNameExpression(state, tagName));
	let tagNameExp = tagNameCaptures.expression;
	if (!lua.list.isEmpty(tagNameCaptures.statements)) {
		state.prereqList(tagNameCaptures.statements);
		tagNameExp = state.pushToVarIfComplex(tagNameExp);
	}
	return tagNameExp;
}

const KEY_ATTRIBUTE_NAME = "Key";
const REF_ATTRIBUTE_NAME = "Ref";
const CHANGE_ATTRIBUTE_NAME = "Change";
const EVENT_ATTRIBUTE_NAME = "Event";

function getKeyValue(element: ts.JsxElement | ts.JsxSelfClosingElement) {
	for (const attribute of getAttributes(element).properties) {
		if (
			ts.isJsxAttribute(attribute) &&
			attribute.name.text === KEY_ATTRIBUTE_NAME &&
			attribute.initializer &&
			ts.isStringLiteral(attribute.initializer)
		) {
			return attribute.initializer.text;
		}
	}
}

function isFlatObject(expression: ts.ObjectLiteralExpression) {
	for (const property of expression.properties) {
		if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
			return false;
		}
	}
	return true;
}

function transformSpecialAttribute(state: TransformState, attribute: ts.JsxAttribute, attributesPtr: MapPointer) {
	assert(attribute.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression);
	const expression = attribute.initializer.expression;
	if (ts.isObjectLiteralExpression(expression) && isFlatObject(expression)) {
		for (const property of expression.properties) {
			assert(ts.isPropertyAssignment(property) && ts.isIdentifier(property.name));
			const { expression: init, statements: initPrereqs } = transformJsxInitializer(state, property.initializer);
			if (!lua.list.isEmpty(initPrereqs)) {
				disableMapInline(state, attributesPtr);
			}
			state.prereqList(initPrereqs);
			assignToMapPointer(state, attributesPtr, Roact(attribute.name.text, property.name.text), init);
		}
	} else {
		disableMapInline(state, attributesPtr);

		const init = transformExpression(state, expression);
		const keyId = lua.tempId();
		const valueId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.pairs,
					args: lua.list.make(init),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: attributesPtr.value,
							index: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
								expression: Roact(attribute.name.text),
								index: keyId,
							}),
						}),
						right: valueId,
					}),
				),
			}),
		);
	}
}

function transformJsxAttribute(state: TransformState, attribute: ts.JsxAttribute, attributesPtr: MapPointer) {
	const attributeName = attribute.name.text;
	if (attributeName === KEY_ATTRIBUTE_NAME) return;

	if (attributeName === EVENT_ATTRIBUTE_NAME || attributeName === CHANGE_ATTRIBUTE_NAME) {
		transformSpecialAttribute(state, attribute, attributesPtr);
		return;
	}

	const { expression: init, statements: initPrereqs } = transformJsxInitializer(state, attribute.initializer);
	if (!lua.list.isEmpty(initPrereqs)) {
		disableMapInline(state, attributesPtr);
		state.prereqList(initPrereqs);
	}

	const name = attributeName === REF_ATTRIBUTE_NAME ? Roact("Ref") : lua.string(attributeName);
	assignToMapPointer(state, attributesPtr, name, init);
}

function transformJsxAttributes(state: TransformState, attributes: ts.JsxAttributes, attributesPtr: MapPointer) {
	for (const attribute of attributes.properties) {
		if (ts.isJsxAttribute(attribute)) {
			transformJsxAttribute(state, attribute, attributesPtr);
		} else {
			// spread attribute
			disableMapInline(state, attributesPtr);
			const expression = transformExpression(state, attribute.expression);
			state.prereq(createJsxAttributeLoop(attributesPtr.value, expression));
		}
	}
}

function transformJsxChildren(
	state: TransformState,
	children: ReadonlyArray<ts.JsxChild>,
	attributesPtr: MapPointer,
	childrenPtr: MixedTablePointer,
) {
	const lengthId = lua.tempId();
	let lengthInitialized = false;
	let amtChildrenSinceUpdate = 0;

	function updateLengthId() {
		state.prereq(
			lua.create(lengthInitialized ? lua.SyntaxKind.Assignment : lua.SyntaxKind.VariableDeclaration, {
				left: lengthId,
				right: lua.create(lua.SyntaxKind.UnaryExpression, {
					operator: "#",
					expression: childrenPtr.value,
				}),
			}),
		);
		if (!lengthInitialized) {
			lengthInitialized = true;
		}
		amtChildrenSinceUpdate = 0;
	}

	function disableInline() {
		if (lua.isMixedTable(childrenPtr.value)) {
			disableMapInline(state, attributesPtr);
			disableMixedTableInline(state, childrenPtr);
			updateLengthId();
		}
	}

	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (ts.isJsxText(child)) {
			if (!child.containsOnlyTriviaWhiteSpaces) {
				state.addDiagnostic(diagnostics.noJsxText(child));
			}
			continue;
		}

		// not available when jsxFactory is set
		assert(!ts.isJsxFragment(child));

		if (ts.isJsxExpression(child)) {
			const innerExp = child.expression;
			if (innerExp) {
				const { expression, statements } = state.capture(() => transformExpression(state, innerExp));
				if (!lua.list.isEmpty(statements)) {
					state.prereqList(statements);
					disableInline();
				}

				if (child.dotDotDotToken) {
					disableInline();
					assert(lua.isAnyIdentifier(childrenPtr.value));
					state.prereqList(statements);
					state.prereq(createJsxAddAmbiguousChildren(childrenPtr.value, lengthId, expression));
				} else {
					const type = state.getType(innerExp);

					if (state.roactSymbolManager.isElementType(type)) {
						if (lua.isMixedTable(childrenPtr.value)) {
							lua.list.push(childrenPtr.value.fields, expression);
						} else {
							state.prereq(
								createJsxAddNumericChild(
									childrenPtr.value,
									lengthId,
									lua.number(amtChildrenSinceUpdate + 1),
									expression,
								),
							);
						}
						amtChildrenSinceUpdate++;
					} else if (isArrayType(state, type)) {
						disableInline();
						assert(lua.isAnyIdentifier(childrenPtr.value));
						state.prereq(createJsxAddNumericChildren(childrenPtr.value, lengthId, expression));
					} else if (isMapType(state, type)) {
						disableInline();
						assert(lua.isAnyIdentifier(childrenPtr.value));
						state.prereq(createJsxAddAmbiguousChildren(childrenPtr.value, lengthId, expression));
					} else {
						disableInline();
						assert(lua.isAnyIdentifier(childrenPtr.value));
						state.prereq(
							createJsxAddAmbiguousChild(
								childrenPtr.value,
								amtChildrenSinceUpdate,
								lengthId,
								state.pushToVarIfNonId(expression),
							),
						);
					}
				}
				if (i < children.length - 1) {
					updateLengthId();
				}
			}
		} else {
			const { expression, statements } = state.capture(() => transformExpression(state, child));
			if (!lua.list.isEmpty(statements)) {
				disableInline();
			}
			state.prereqList(statements);

			const key = getKeyValue(child);
			if (key) {
				assignToMixedTablePointer(state, childrenPtr, lua.string(key), expression);
			} else {
				if (lua.isMixedTable(childrenPtr.value)) {
					lua.list.push(childrenPtr.value.fields, expression);
				} else {
					state.prereq(
						createJsxAddNumericChild(
							childrenPtr.value,
							lengthId,
							lua.number(amtChildrenSinceUpdate + 1),
							expression,
						),
					);
				}
				amtChildrenSinceUpdate++;
			}
		}
	}
}

export function transformJsx(
	state: TransformState,
	node: ts.JsxElement | ts.JsxSelfClosingElement,
	tagName: ts.JsxTagNameExpression,
	attributes: ts.JsxAttributes,
	children: ReadonlyArray<ts.JsxChild>,
) {
	const isFragment =
		state.typeChecker.getSymbolAtLocation(tagName) ===
		state.roactSymbolManager.getSymbolOrThrow(ROACT_SYMBOL_NAMES.Fragment);

	const tagNameExp = !isFragment ? transformJsxTagName(state, tagName) : lua.emptyId();
	const attributesPtr = createMapPointer();
	const childrenPtr = createMixedTablePointer();
	transformJsxAttributes(state, attributes, attributesPtr);
	transformJsxChildren(state, children, attributesPtr, childrenPtr);

	const args = lua.list.make<lua.Expression>();
	if (!isFragment) {
		lua.list.push(args, tagNameExp);
	}
	const pushAttributes = lua.isAnyIdentifier(attributesPtr.value) || !lua.list.isEmpty(attributesPtr.value.fields);
	const pushChildren = lua.isAnyIdentifier(childrenPtr.value) || !lua.list.isEmpty(childrenPtr.value.fields);
	if (!isFragment && (pushAttributes || pushChildren)) {
		lua.list.push(args, attributesPtr.value);
	}
	if (pushChildren) {
		lua.list.push(args, childrenPtr.value);
	}

	let result: lua.Expression = lua.create(lua.SyntaxKind.CallExpression, {
		expression: isFragment ? Roact("createFragment") : Roact("createElement"),
		args,
	});

	// If this is a top-level element, handle Key here.
	// Otherwise, handle in transformJsxAttributes
	if (!ts.isJsxElement(node.parent)) {
		const key = getKeyValue(node);
		if (key) {
			result = lua.create(lua.SyntaxKind.CallExpression, {
				expression: Roact("createFragment"),
				args: lua.list.make(lua.map([[lua.string(key), result]])),
			});
		}
	}

	return result;
}
