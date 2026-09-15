import { assert } from "Shared/util/assert";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";
import { isArrayType, isDefinitelyType } from "TSTransformer/util/types";
import ts from "typescript";

function getIterableElementType(state: TransformState, type: ts.Type, node: ts.Node): ts.Type {
	const checker = state.typeChecker;
	if (isDefinitelyType(type, isArrayType(state))) {
		const element = type.getNumberIndexType();
		assert(element);
		return element;
	}

	const iterable = checker.getDeclaredTypeOfSymbol(
		state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Iterable),
	);
	const iteratorName = iterable.getProperties()[0].escapedName;
	const iterator = type.getProperties().find(property => property.escapedName === iteratorName);
	assert(iterator);
	const iteratorType = checker.getTypeOfSymbolAtLocation(iterator, node).getCallSignatures()[0].getReturnType();
	const next = checker.getTypeOfPropertyOfType(iteratorType, "next");
	assert(next);
	const result = next.getCallSignatures()[0].getReturnType();
	const values = new Array<ts.Type>();
	for (const part of result.isUnion() ? result.types : [result]) {
		if (checker.getTypeOfPropertyOfType(part, "done") !== checker.getTrueType()) {
			const value = checker.getTypeOfPropertyOfType(part, "value");
			assert(value);
			values.push(value);
		}
	}
	return checker.getUnionType(values);
}

function getElementType(state: TransformState, pattern: ts.ArrayLiteralExpression, index: number): ts.Type {
	if (ts.isSpreadElement(pattern.parent)) {
		const spread = pattern.parent;
		assert(ts.isArrayLiteralExpression(spread.parent));
		return getElementType(state, spread.parent, spread.parent.elements.indexOf(spread) + index);
	}
	const type = getAssignmentPatternType(state, pattern);
	return (
		state.typeChecker.getTypeOfPropertyOfType(type, String(index)) ?? getIterableElementType(state, type, pattern)
	);
}

function getPropertyType(state: TransformState, pattern: ts.ObjectLiteralExpression, name: ts.PropertyName): ts.Type {
	const checker = state.typeChecker;
	const type = getAssignmentPatternType(state, pattern);
	const keyType = ts.isComputedPropertyName(name)
		? state.getType(name.expression)
		: ts.isNumericLiteral(name)
			? checker.getNumberLiteralType(Number(name.text))
			: checker.getStringLiteralType(name.text);
	const values = new Array<ts.Type>();
	for (const key of keyType.isUnion() ? keyType.types : [keyType]) {
		let value: ts.Type | undefined;
		if (key.isStringLiteral() || key.isNumberLiteral()) {
			if (ts.isSpreadElement(pattern.parent)) {
				const spread = pattern.parent;
				assert(ts.isArrayLiteralExpression(spread.parent));
				value = getElementType(
					state,
					spread.parent,
					spread.parent.elements.indexOf(spread) + Number(key.value),
				);
			} else {
				value = checker.getTypeOfPropertyOfType(type, String(key.value));
			}
		}
		value ??= checker.getIndexTypeOfType(
			type,
			key.flags & ts.TypeFlags.NumberLike ? ts.IndexKind.Number : ts.IndexKind.String,
		);
		assert(value);
		values.push(value);
	}
	return checker.getUnionType(values);
}

// TypeScript's assignment-pattern query cannot traverse a rest element's parent
// resolve that part of the source path here, retaining tuple positions through nested rest
export function getAssignmentPatternType(state: TransformState, pattern: ts.AssignmentPattern): ts.Type {
	if (!ts.findAncestor(pattern.parent, ts.isSpreadElement)) {
		return state.typeChecker.getTypeOfAssignmentPattern(pattern);
	}
	const parent = pattern.parent;
	if (ts.isSpreadElement(parent)) {
		assert(ts.isArrayLiteralExpression(parent.parent));
		return state.typeChecker.createArrayType(
			getIterableElementType(state, getAssignmentPatternType(state, parent.parent), pattern),
		);
	}

	const element = ts.isBinaryExpression(parent) ? parent : pattern;
	const container = element.parent;
	let source: ts.Type;
	if (ts.isArrayLiteralExpression(container)) {
		source = getElementType(state, container, container.elements.indexOf(element));
	} else if (ts.isPropertyAssignment(container)) {
		source = getPropertyType(state, container.parent, container.name);
	} else {
		return state.typeChecker.getTypeOfAssignmentPattern(pattern);
	}
	return ts.isBinaryExpression(element)
		? state.typeChecker.getUnionType([state.typeChecker.getNonNullableType(source), state.getType(element.right)])
		: source;
}
