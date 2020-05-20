import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { binaryExpressionChain } from "TSTransformer/util/expressionChain";
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

// TODO symbol
const KEY_ATTRIBUTE_NAME = "Key";

function isKeyAttribute(attribute: ts.JsxAttribute): attribute is ts.JsxAttribute & { initializer: ts.StringLiteral } {
	return (
		attribute.name.text === KEY_ATTRIBUTE_NAME &&
		attribute.initializer !== undefined &&
		ts.isStringLiteral(attribute.initializer)
	);
}

function getKeyAttribute(element: ts.JsxElement | ts.JsxSelfClosingElement) {
	for (const attribute of getAttributes(element).properties) {
		if (ts.isJsxAttribute(attribute) && isKeyAttribute(attribute)) {
			return attribute.initializer.text;
		}
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
	keyId: lua.TemporaryIdentifier,
	valueId: lua.TemporaryIdentifier,
) {
	return lua.create(lua.SyntaxKind.Assignment, {
		left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: childrenPtrValue,
			index: lua.create(lua.SyntaxKind.BinaryExpression, {
				left: lengthId,
				operator: "+",
				right: keyId,
			}),
		}),
		right: valueId,
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
			createJsxAddNumericChildPrereq(childrenPtrValue, amtChildrenSinceUpdate, lengthId, expression),
		),
		elseBody: lua.list.make(createJsxAddAmbiguousChildren(childrenPtrValue, lengthId, expression)),
	});
}

function createJsxAddNumericChildPrereq(
	childrenPtrValue: lua.AnyIdentifier,
	amtChildrenSinceUpdate: number,
	lengthId: lua.AnyIdentifier,
	expression: lua.Expression,
) {
	return lua.create(lua.SyntaxKind.Assignment, {
		left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: childrenPtrValue,
			index:
				amtChildrenSinceUpdate > 0
					? lua.create(lua.SyntaxKind.BinaryExpression, {
							left: lengthId,
							operator: "+",
							right: lua.number(amtChildrenSinceUpdate),
					  })
					: lengthId,
		}),
		right: expression,
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
	assert(lua.isSimple(tagNameExp));
	return tagNameExp;
}

function transformJsxAttributes(state: TransformState, attributes: ts.JsxAttributes, attributesPtr: MapPointer) {
	for (const attribute of attributes.properties) {
		if (ts.isJsxAttribute(attribute)) {
			if (isKeyAttribute(attribute)) continue;
			const { expression: init, statements: initPrereqs } = transformJsxInitializer(state, attribute.initializer);
			if (!lua.list.isEmpty(initPrereqs)) {
				disableMapInline(state, attributesPtr);
			}
			state.prereqList(initPrereqs);
			assignToMapPointer(state, attributesPtr, lua.string(attribute.name.text), init);
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
			if (child.expression) {
				if (lua.isMixedTable(childrenPtr.value)) {
					disableMapInline(state, attributesPtr);
					disableMixedTableInline(state, childrenPtr);
					updateLengthId();
				}
				assert(lua.isAnyIdentifier(childrenPtr.value));
				const expression = transformExpression(state, child.expression);
				if (child.dotDotDotToken) {
					state.prereq(createJsxAddAmbiguousChildren(childrenPtr.value, lengthId, expression));
				} else {
					// TODO make this better?
					state.prereq(
						createJsxAddAmbiguousChild(
							childrenPtr.value,
							amtChildrenSinceUpdate,
							lengthId,
							state.pushToVarIfNonId(expression),
						),
					);
				}
				if (i < children.length - 1) {
					updateLengthId();
				}
			}
		} else {
			const { expression, statements } = state.capture(() => transformExpression(state, child));
			if (lua.isMixedTable(childrenPtr.value) && !lua.list.isEmpty(statements)) {
				disableMapInline(state, attributesPtr);
				disableMixedTableInline(state, childrenPtr);
				updateLengthId();
				state.prereqList(statements);
			}

			const key = getKeyAttribute(child);
			if (key) {
				assignToMixedTablePointer(state, childrenPtr, lua.string(key), expression);
			} else {
				if (lua.isMixedTable(childrenPtr.value)) {
					lua.list.push(childrenPtr.value.fields, expression);
				} else {
					state.prereq(
						createJsxAddNumericChildPrereq(childrenPtr.value, amtChildrenSinceUpdate, lengthId, expression),
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
	const tagNameExp = transformJsxTagName(state, tagName);
	const attributesPtr = createMapPointer();
	const childrenPtr = createMixedTablePointer();
	transformJsxAttributes(state, attributes, attributesPtr);
	transformJsxChildren(state, children, attributesPtr, childrenPtr);

	// TODO Fragment
	const expression = lua.create(lua.SyntaxKind.PropertyAccessExpression, {
		expression: lua.id("Roact"),
		name: "createElement",
	});

	const args = lua.list.make<lua.Expression>(tagNameExp);
	if (lua.isAnyIdentifier(attributesPtr.value) || !lua.list.isEmpty(attributesPtr.value.fields)) {
		lua.list.push(args, attributesPtr.value);
	}
	if (lua.isAnyIdentifier(childrenPtr.value) || !lua.list.isEmpty(childrenPtr.value.fields)) {
		lua.list.push(args, childrenPtr.value);
	}

	let result: lua.Expression = lua.create(lua.SyntaxKind.CallExpression, { expression, args });

	if (!ts.isJsxElement(node.parent)) {
		const key = getKeyAttribute(node);
		if (key) {
			result = lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
					expression: lua.id("Roact"),
					name: "createFragment",
				}),
				args: lua.list.make(lua.map([[lua.string(key), result]])),
			});
		}
	}

	return result;
}
