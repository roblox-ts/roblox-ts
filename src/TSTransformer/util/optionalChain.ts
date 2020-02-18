import * as tsst from "ts-simple-type";
import { TransformState } from "TSTransformer";
import ts, { ElementAccessExpression } from "typescript";

enum OptionalChainItemKind {
	PropertyAccess,
	ElementAccess,
	Call,
}

interface OptionalChainItem {
	optional: boolean;
	type: ts.Type;
}

interface PropertyAccessItem extends OptionalChainItem {
	kind: OptionalChainItemKind.PropertyAccess;
	name: string;
}

interface ElementAccessItem extends OptionalChainItem {
	kind: OptionalChainItemKind.ElementAccess;
	expression: ts.Expression;
}

interface CallItem extends OptionalChainItem {
	kind: OptionalChainItemKind.Call;
	args: ReadonlyArray<ts.Expression>;
}

function createPropertyAccessItem(state: TransformState, node: ts.PropertyAccessExpression): PropertyAccessItem {
	return {
		kind: OptionalChainItemKind.PropertyAccess,
		optional: node.questionDotToken !== undefined,
		type: state.typeChecker.getTypeAtLocation(node.expression),
		name: node.name.text,
	};
}

function createElementAccessItem(state: TransformState, node: ts.ElementAccessExpression): ElementAccessItem {
	return {
		kind: OptionalChainItemKind.ElementAccess,
		optional: node.questionDotToken !== undefined,
		type: state.typeChecker.getTypeAtLocation(node.expression),
		expression: node.argumentExpression,
	};
}

function createCallItem(state: TransformState, node: ts.CallExpression): CallItem {
	return {
		kind: OptionalChainItemKind.Call,
		optional: node.questionDotToken !== undefined,
		type: state.typeChecker.getTypeAtLocation(node.expression),
		args: node.arguments,
	};
}

export function flattenOptionalChain(state: TransformState, expression: ts.Expression) {
	const chain = new Array<PropertyAccessItem | ElementAccessItem | CallItem>();
	while (true) {
		if (ts.isPropertyAccessExpression(expression)) {
			chain.unshift(createPropertyAccessItem(state, expression));
			expression = expression.expression;
		} else if (ts.isElementAccessExpression(expression)) {
			chain.unshift(createElementAccessItem(state, expression));
			expression = expression.expression;
		} else if (ts.isCallExpression(expression)) {
			chain.unshift(createCallItem(state, expression));
			expression = expression.expression;
		} else {
			break;
		}
	}
	return { chain, expression };
}

function removeUndefined(type: tsst.SimpleType): tsst.SimpleType {
	if (type.kind === tsst.SimpleTypeKind.UNDEFINED) {
		return { kind: tsst.SimpleTypeKind.NEVER };
	} else if (type.kind === tsst.SimpleTypeKind.UNION) {
		const types = type.types.filter(v => v.kind !== tsst.SimpleTypeKind.UNDEFINED);
		if (types.length === 0) {
			throw "???";
		} else if (types.length === 1) {
			return types[0];
		} else {
			return {
				kind: tsst.SimpleTypeKind.UNION,
				types,
			};
		}
	} else {
		return type;
	}
}

export function debugOptionalChain(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.CallExpression,
) {
	const { chain, expression } = flattenOptionalChain(state, node);

	console.log(
		expression.getText(),
		chain.map(v => ({
			type: tsst.toTypeString(removeUndefined(tsst.toSimpleType(v.type, state.typeChecker))),
			optional: v.optional,
			value:
				v.kind === OptionalChainItemKind.PropertyAccess
					? v.name
					: v.kind === OptionalChainItemKind.ElementAccess
					? v.expression.getText()
					: v.args.map(v => v.getText()),
		})),
	);
}
