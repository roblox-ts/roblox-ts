import ts from "byots";
import luau from "LuauAST";
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
import { isArrayType, isMapType, canBeUndefined } from "TSTransformer/util/types";

function Roact(...indices: Array<string>) {
	return propertyAccessExpressionChain(luau.id("Roact"), indices);
}

function transformJsxTagNameExpression(state: TransformState, node: ts.JsxTagNameExpression) {
	if (ts.isIdentifier(node)) {
		const symbol = state.typeChecker.getSymbolAtLocation(node);
		if (symbol) {
			assert(state.roactSymbolManager);
			const className = state.roactSymbolManager.getIntrinsicElementClassNameFromSymbol(symbol);
			if (className !== undefined) {
				return luau.string(className);
			}
		}
	}

	if (ts.isPropertyAccessExpression(node)) {
		if (ts.isPrivateIdentifier(node.name)) {
			state.addDiagnostic(diagnostics.noPrivateIdentifier(node.name));
		}
		return luau.create(luau.SyntaxKind.PropertyAccessExpression, {
			expression: convertToIndexableExpression(transformExpression(state, node.expression)),
			name: node.name.text,
		});
	} else {
		return transformExpression(state, node);
	}
}

function transformJsxInitializer(
	state: TransformState,
	initializer: ts.Expression | undefined,
): [luau.Expression, luau.List<luau.Statement>] {
	if (initializer && ts.isJsxExpression(initializer)) {
		initializer = initializer.expression;
	}
	if (initializer) {
		return state.capture(() => transformExpression(state, initializer!));
	} else {
		return [luau.bool(true), luau.list.make<luau.Statement>()];
	}
}

function getAttributes(node: ts.JsxElement | ts.JsxSelfClosingElement) {
	if (ts.isJsxElement(node)) {
		return node.openingElement.attributes;
	} else {
		return node.attributes;
	}
}

function createJsxAttributeLoop(
	state: TransformState,
	attributesPtrValue: luau.AnyIdentifier,
	expression: luau.Expression,
	type: ts.Type,
) {
	const possiblyUndefined = canBeUndefined(state, type);
	if (possiblyUndefined) {
		expression = state.pushToVarIfComplex(expression);
	}

	const keyId = luau.tempId();
	const valueId = luau.tempId();
	let statement: luau.Statement = luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make(keyId, valueId),
		expression: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.pairs,
			args: luau.list.make(expression),
		}),
		statements: luau.list.make(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: attributesPtrValue,
					index: keyId,
				}),
				operator: "=",
				right: valueId,
			}),
		),
	});

	if (possiblyUndefined) {
		statement = luau.create(luau.SyntaxKind.IfStatement, {
			condition: expression,
			statements: luau.list.make(statement),
			elseBody: luau.list.make(),
		});
	}

	return statement;
}

/** `children[lengthId + keyId] = valueId` */
function createJsxAddNumericChild(
	childrenPtrValue: luau.AnyIdentifier,
	lengthId: luau.AnyIdentifier,
	key: luau.Expression,
	value: luau.Expression,
) {
	return luau.create(luau.SyntaxKind.Assignment, {
		left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: childrenPtrValue,
			index: luau.binary(lengthId, "+", key),
		}),
		operator: "=",
		right: value,
	});
}

/** `children[keyId] = valueId` */
function createJsxAddKeyChild(
	childrenPtrValue: luau.AnyIdentifier,
	keyId: luau.TemporaryIdentifier,
	valueId: luau.TemporaryIdentifier,
) {
	return luau.create(luau.SyntaxKind.Assignment, {
		left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: childrenPtrValue,
			index: keyId,
		}),
		operator: "=",
		right: valueId,
	});
}

function createJsxAddNumericChildren(
	childrenPtrValue: luau.AnyIdentifier,
	lengthId: luau.AnyIdentifier,
	expression: luau.Expression,
) {
	const keyId = luau.tempId();
	const valueId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make(keyId, valueId),
		expression: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.pairs,
			args: luau.list.make(expression),
		}),
		statements: luau.list.make(createJsxAddNumericChild(childrenPtrValue, lengthId, keyId, valueId)),
	});
}

function createJsxAddAmbiguousChildren(
	childrenPtrValue: luau.AnyIdentifier,
	lengthId: luau.AnyIdentifier,
	expression: luau.Expression,
) {
	const keyId = luau.tempId();
	const valueId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make(keyId, valueId),
		expression: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.pairs,
			args: luau.list.make(expression),
		}),
		statements: luau.list.make<luau.Statement>(
			luau.create(luau.SyntaxKind.IfStatement, {
				// type(keyId) == "string"
				condition: luau.create(luau.SyntaxKind.BinaryExpression, {
					left: luau.create(luau.SyntaxKind.CallExpression, {
						expression: luau.globals.type,
						args: luau.list.make(keyId),
					}),
					operator: "==",
					right: luau.strings.number,
				}),
				statements: luau.list.make(createJsxAddNumericChild(childrenPtrValue, lengthId, keyId, valueId)),
				elseBody: luau.list.make(createJsxAddKeyChild(childrenPtrValue, keyId, valueId)),
			}),
		),
	});
}

function createJsxAddAmbiguousChild(
	childrenPtrValue: luau.AnyIdentifier,
	amtChildrenSinceUpdate: number,
	lengthId: luau.AnyIdentifier,
	expression: luau.IndexableExpression,
) {
	return luau.create(luau.SyntaxKind.IfStatement, {
		condition: luau.create(luau.SyntaxKind.BinaryExpression, {
			left: luau.create(luau.SyntaxKind.CallExpression, {
				expression: luau.globals.type,
				args: luau.list.make(expression),
			}),
			operator: "==",
			right: luau.strings.table,
		}),
		statements: luau.list.make(
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: luau.create(luau.SyntaxKind.BinaryExpression, {
					left: luau.create(luau.SyntaxKind.BinaryExpression, {
						left: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
							expression,
							name: "props",
						}),
						operator: "~=",
						right: luau.nil(),
					}),

					operator: "and",
					right: luau.create(luau.SyntaxKind.BinaryExpression, {
						left: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
							expression,
							name: "component",
						}),
						operator: "~=",
						right: luau.nil(),
					}),
				}),
				statements: luau.list.make(
					createJsxAddNumericChild(
						childrenPtrValue,
						lengthId,
						luau.number(amtChildrenSinceUpdate + 1),
						expression,
					),
				),
				elseBody: luau.list.make(createJsxAddAmbiguousChildren(childrenPtrValue, lengthId, expression)),
			}),
		),
		elseBody: luau.list.make(),
	});
}

// maybe unnecessary?
function transformJsxTagName(state: TransformState, tagName: ts.JsxTagNameExpression) {
	const [expression, prereqs] = state.capture(() => transformJsxTagNameExpression(state, tagName));
	let tagNameExp = expression;
	if (!luau.list.isEmpty(prereqs)) {
		state.prereqList(prereqs);
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
			const [init, initPrereqs] = transformJsxInitializer(state, property.initializer);
			if (!luau.list.isEmpty(initPrereqs)) {
				disableMapInline(state, attributesPtr);
			}
			state.prereqList(initPrereqs);
			assignToMapPointer(state, attributesPtr, Roact(attribute.name.text, property.name.text), init);
		}
	} else {
		disableMapInline(state, attributesPtr);

		const init = transformExpression(state, expression);
		const keyId = luau.tempId();
		const valueId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.globals.pairs,
					args: luau.list.make(init),
				}),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: attributesPtr.value,
							index: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
								expression: Roact(attribute.name.text),
								index: keyId,
							}),
						}),
						operator: "=",
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

	const [init, initPrereqs] = transformJsxInitializer(state, attribute.initializer);
	if (!luau.list.isEmpty(initPrereqs)) {
		disableMapInline(state, attributesPtr);
		state.prereqList(initPrereqs);
	}

	const name = attributeName === REF_ATTRIBUTE_NAME ? Roact("Ref") : luau.string(attributeName);
	assignToMapPointer(state, attributesPtr, name, init);
}

function transformJsxAttributes(state: TransformState, attributes: ts.JsxAttributes, attributesPtr: MapPointer) {
	for (const attribute of attributes.properties) {
		if (ts.isJsxAttribute(attribute)) {
			transformJsxAttribute(state, attribute, attributesPtr);
		} else {
			// spread attributes
			disableMapInline(state, attributesPtr);
			const expression = transformExpression(state, attribute.expression);
			state.prereq(
				createJsxAttributeLoop(state, attributesPtr.value, expression, state.getType(attribute.expression)),
			);
		}
	}
}

function transformJsxChildren(
	state: TransformState,
	children: ReadonlyArray<ts.JsxChild>,
	attributesPtr: MapPointer,
	childrenPtr: MixedTablePointer,
) {
	const lengthId = luau.tempId();
	let lengthInitialized = false;
	let amtChildrenSinceUpdate = 0;

	function updateLengthId() {
		const right = luau.unary("#", childrenPtr.value);
		if (lengthInitialized) {
			state.prereq(
				luau.create(luau.SyntaxKind.Assignment, {
					left: lengthId,
					operator: "=",
					right,
				}),
			);
		} else {
			state.prereq(
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: lengthId,
					right,
				}),
			);
			lengthInitialized = true;
		}
		amtChildrenSinceUpdate = 0;
	}

	function disableInline() {
		if (luau.isMixedTable(childrenPtr.value)) {
			if (luau.isMap(attributesPtr.value) && !luau.list.isEmpty(attributesPtr.value.fields)) {
				disableMapInline(state, attributesPtr);
			}
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
				const [expression, prereqs] = state.capture(() => transformExpression(state, innerExp));
				if (!luau.list.isEmpty(prereqs)) {
					state.prereqList(prereqs);
					disableInline();
				}

				if (child.dotDotDotToken) {
					// spread children
					disableInline();
					assert(luau.isAnyIdentifier(childrenPtr.value));
					state.prereqList(prereqs);
					state.prereq(createJsxAddAmbiguousChildren(childrenPtr.value, lengthId, expression));
				} else {
					const type = state.getType(innerExp);

					if (state.roactSymbolManager && state.roactSymbolManager.isElementType(type)) {
						if (luau.isMixedTable(childrenPtr.value)) {
							luau.list.push(childrenPtr.value.fields, expression);
						} else {
							state.prereq(
								createJsxAddNumericChild(
									childrenPtr.value,
									lengthId,
									luau.number(amtChildrenSinceUpdate + 1),
									expression,
								),
							);
						}
						amtChildrenSinceUpdate++;
					} else if (isArrayType(state, type)) {
						disableInline();
						assert(luau.isAnyIdentifier(childrenPtr.value));
						state.prereq(createJsxAddNumericChildren(childrenPtr.value, lengthId, expression));
					} else if (isMapType(state, type)) {
						disableInline();
						assert(luau.isAnyIdentifier(childrenPtr.value));
						state.prereq(createJsxAddAmbiguousChildren(childrenPtr.value, lengthId, expression));
					} else {
						disableInline();
						assert(luau.isAnyIdentifier(childrenPtr.value));
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
			const [expression, prereqs] = state.capture(() => transformExpression(state, child));
			if (!luau.list.isEmpty(prereqs)) {
				disableInline();
			}
			state.prereqList(prereqs);

			const key = getKeyValue(child);
			if (key) {
				assignToMixedTablePointer(state, childrenPtr, luau.string(key), expression);
			} else {
				if (luau.isMixedTable(childrenPtr.value)) {
					luau.list.push(childrenPtr.value.fields, expression);
				} else {
					state.prereq(
						createJsxAddNumericChild(
							childrenPtr.value,
							lengthId,
							luau.number(amtChildrenSinceUpdate + 1),
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
		state.roactSymbolManager &&
		state.typeChecker.getSymbolAtLocation(tagName) ===
			state.roactSymbolManager.getSymbolOrThrow(ROACT_SYMBOL_NAMES.Fragment);

	const tagNameExp = !isFragment ? transformJsxTagName(state, tagName) : luau.emptyId();
	const attributesPtr = createMapPointer();
	const childrenPtr = createMixedTablePointer();
	transformJsxAttributes(state, attributes, attributesPtr);
	transformJsxChildren(state, children, attributesPtr, childrenPtr);

	const args = luau.list.make<luau.Expression>();
	if (!isFragment) {
		luau.list.push(args, tagNameExp);
	}
	const pushAttributes = luau.isAnyIdentifier(attributesPtr.value) || !luau.list.isEmpty(attributesPtr.value.fields);
	const pushChildren = luau.isAnyIdentifier(childrenPtr.value) || !luau.list.isEmpty(childrenPtr.value.fields);
	if (!isFragment && (pushAttributes || pushChildren)) {
		luau.list.push(args, attributesPtr.value);
	}
	if (pushChildren) {
		luau.list.push(args, childrenPtr.value);
	}

	let result: luau.Expression = luau.create(luau.SyntaxKind.CallExpression, {
		expression: isFragment ? Roact("createFragment") : Roact("createElement"),
		args,
	});

	// if this is a top-level element, handle Key here
	// otherwise, handle in transformJsxAttributes
	if (!ts.isJsxElement(node.parent)) {
		const key = getKeyValue(node);
		if (key) {
			result = luau.create(luau.SyntaxKind.CallExpression, {
				expression: Roact("createFragment"),
				args: luau.list.make(luau.map([[luau.string(key), result]])),
			});
		}
	}

	return result;
}
