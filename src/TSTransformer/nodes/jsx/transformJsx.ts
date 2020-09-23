import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { ROACT_SYMBOL_NAMES } from "TSTransformer/classes/RoactSymbolManager";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformJsxAttributes } from "TSTransformer/nodes/jsx/transformJsxAttributes";
import { transformJsxChildren } from "TSTransformer/nodes/jsx/transformJsxChildren";
import { transformJsxTagName } from "TSTransformer/nodes/jsx/transformJsxTagName";
import { createRoactIndex } from "TSTransformer/util/jsx/createRoactIndex";
import { getKeyAttributeInitializer } from "TSTransformer/util/jsx/getKeyAttributeInitializer";
import { createMapPointer, createMixedTablePointer } from "TSTransformer/util/pointer";

export function transformJsx(
	state: TransformState,
	node: ts.JsxElement | ts.JsxSelfClosingElement,
	tagName: ts.JsxTagNameExpression,
	attributes: ts.JsxAttributes,
	children: ReadonlyArray<ts.JsxChild>,
) {
	const isFragment =
		state.services.roactSymbolManager &&
		state.typeChecker.getSymbolAtLocation(tagName) ===
			state.services.roactSymbolManager.getSymbolOrThrow(ROACT_SYMBOL_NAMES.Fragment);

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
		expression: isFragment ? createRoactIndex("createFragment") : createRoactIndex("createElement"),
		args,
	});

	// if this is a top-level element, handle Key here
	// otherwise, handle in transformJsxChildren
	if (!ts.isJsxElement(node.parent)) {
		const keyInitializer = getKeyAttributeInitializer(node);
		if (keyInitializer) {
			const [key, keyPrereqs] = state.capture(() => transformExpression(state, keyInitializer));
			state.prereqList(keyPrereqs);
			result = luau.create(luau.SyntaxKind.CallExpression, {
				expression: createRoactIndex("createFragment"),
				args: luau.list.make(luau.map([[key, result]])),
			});
		}
	}

	return result;
}
