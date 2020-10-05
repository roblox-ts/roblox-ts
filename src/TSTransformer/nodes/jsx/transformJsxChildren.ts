import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { createTypeCheck } from "TSTransformer/util/createTypeCheck";
import { getKeyAttributeInitializer } from "TSTransformer/util/jsx/getKeyAttributeInitializer";
import { offset } from "TSTransformer/util/offset";
import {
	assignToMixedTablePointer,
	disableMapInline,
	disableMixedTableInline,
	MapPointer,
	MixedTablePointer,
} from "TSTransformer/util/pointer";
import {
	isArrayType,
	isBooleanLiteralType,
	isDefinitelyType,
	isMapType,
	isPossiblyType,
	isRoactElementType,
	isUndefinedType,
} from "TSTransformer/util/types";

/** `children[lengthId + keyId] = valueId` */
function createJsxAddNumericChild(
	id: luau.AnyIdentifier,
	lengthId: luau.Expression,
	key: luau.Expression,
	value: luau.Expression,
) {
	return luau.create(luau.SyntaxKind.Assignment, {
		left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: id,
			index: luau.binary(lengthId, "+", key),
		}),
		operator: "=",
		right: value,
	});
}

/** `children[keyId] = valueId` */
function createJsxAddKeyChild(
	id: luau.AnyIdentifier,
	keyId: luau.TemporaryIdentifier,
	valueId: luau.TemporaryIdentifier,
) {
	return luau.create(luau.SyntaxKind.Assignment, {
		left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: id,
			index: keyId,
		}),
		operator: "=",
		right: valueId,
	});
}

function createJsxAddAmbiguousChildren(
	id: luau.AnyIdentifier,
	amtSinceUpdate: number,
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
		statements: luau.list.make(
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: createTypeCheck(keyId, luau.strings.number),
				statements: luau.list.make(
					createJsxAddNumericChild(id, offset(lengthId, amtSinceUpdate), keyId, valueId),
				),
				elseBody: luau.list.make(createJsxAddKeyChild(id, keyId, valueId)),
			}),
		),
	});
}

function createJsxAddArrayChildren(
	id: luau.AnyIdentifier,
	amtSinceUpdate: number,
	lengthId: luau.AnyIdentifier,
	expression: luau.Expression,
) {
	const keyId = luau.tempId();
	const valueId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make(keyId, valueId),
		expression: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.ipairs,
			args: luau.list.make(expression),
		}),
		statements: luau.list.make(createJsxAddNumericChild(id, offset(lengthId, amtSinceUpdate), keyId, valueId)),
	});
}

function createJsxAddMapChildren(id: luau.AnyIdentifier, expression: luau.Expression) {
	const keyId = luau.tempId();
	const valueId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make(keyId, valueId),
		expression: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.pairs,
			args: luau.list.make(expression),
		}),
		statements: luau.list.make(createJsxAddKeyChild(id, keyId, valueId)),
	});
}

// ideally, this would be done automatically..
function countCreateJsxAddChildExpressionUses(
	isPossiblyUndefinedOrFalse: boolean,
	isPossiblyTrue: boolean,
	isPossiblyElement: boolean,
	isPossiblyArray: boolean,
	isPossiblyMap: boolean,
) {
	let expUses = 0;
	if (isPossiblyElement) {
		expUses += 1;
	}
	if (isPossiblyArray || isPossiblyMap) {
		expUses += 1;
		if (isPossiblyElement) {
			expUses += 3;
		}
	}
	if ((isPossiblyUndefinedOrFalse || isPossiblyTrue) && (isPossiblyElement || isPossiblyArray || isPossiblyMap)) {
		expUses += 1;
	}
	return expUses;
}

function createJsxAddChild(
	state: TransformState,
	id: luau.AnyIdentifier,
	amtSinceUpdate: number,
	lengthId: luau.AnyIdentifier,
	expression: luau.Expression,
	type: ts.Type,
): luau.Statement {
	const isPossiblyUndefinedOrFalse = isPossiblyType(
		type,
		t => isUndefinedType(t) || isBooleanLiteralType(state, t, false),
	);
	const isPossiblyTrue = isPossiblyType(type, t => isBooleanLiteralType(state, t, true));
	const isPossiblyElement = isPossiblyType(type, t => isRoactElementType(state, t));
	const isPossiblyArray = isPossiblyType(type, t => isArrayType(state, t));
	const isPossiblyMap = isPossiblyType(type, t => isMapType(state, t));

	const expUses = countCreateJsxAddChildExpressionUses(
		isPossiblyUndefinedOrFalse,
		isPossiblyTrue,
		isPossiblyElement,
		isPossiblyArray,
		isPossiblyMap,
	);
	if (expUses > 1) {
		expression = state.pushToVarIfNonId(expression);
	}

	let statement!: luau.Statement;

	if (isPossiblyElement) {
		statement = createJsxAddNumericChild(id, lengthId, luau.number(amtSinceUpdate + 1), expression);
	}

	if (isPossiblyArray || isPossiblyMap) {
		let loop: luau.ForStatement;
		if (isPossiblyArray && isPossiblyMap) {
			loop = createJsxAddAmbiguousChildren(id, amtSinceUpdate, lengthId, expression);
		} else if (isPossiblyArray) {
			loop = createJsxAddArrayChildren(id, amtSinceUpdate, lengthId, expression);
		} else {
			loop = createJsxAddMapChildren(id, expression);
		}

		if (isPossiblyElement) {
			assert(luau.isAnyIdentifier(expression));
			const isFragmentCheck = luau.binary(luau.property(expression, "elements"), "~=", luau.nil());
			const hasPropsCheck = luau.binary(luau.property(expression, "props"), "~=", luau.nil());
			const hasComponentCheck = luau.binary(luau.property(expression, "component"), "~=", luau.nil());
			const isElementCheck = luau.binary(hasPropsCheck, "and", hasComponentCheck);
			const isElementLikeCheck = luau.binary(isFragmentCheck, "or", isElementCheck);
			statement = luau.create(luau.SyntaxKind.IfStatement, {
				condition: isElementLikeCheck,
				statements: luau.list.make(statement!),
				elseBody: luau.list.make(loop),
			});
		} else {
			statement = loop;
		}
	}

	if (isPossiblyUndefinedOrFalse || isPossiblyTrue) {
		if (isPossiblyElement || isPossiblyArray || isPossiblyMap) {
			let condition: luau.Expression;
			if (isPossiblyTrue) {
				condition = createTypeCheck(expression, luau.strings.table);
			} else {
				condition = expression;
			}
			statement = luau.create(luau.SyntaxKind.IfStatement, {
				condition,
				statements: luau.list.make(statement!),
				elseBody: luau.list.make(),
			});
		} else {
			statement = luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: luau.emptyId(),
				right: expression,
			});
		}
	}

	assert(statement);
	return statement;
}

export function transformJsxChildren(
	state: TransformState,
	children: ReadonlyArray<ts.JsxChild>,
	attributesPtr: MapPointer,
	childrenPtr: MixedTablePointer,
) {
	const lengthId = luau.tempId();
	let lengthInitialized = false;
	let amtSinceUpdate = 0;

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
		amtSinceUpdate = 0;
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

	let lastUsefulElementIndex: number;
	for (lastUsefulElementIndex = children.length - 1; lastUsefulElementIndex >= 0; lastUsefulElementIndex--) {
		const child = children[lastUsefulElementIndex];
		if (!ts.isJsxText(child) || !child.containsOnlyTriviaWhiteSpaces) break;
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
					disableInline();
					assert(luau.isAnyIdentifier(childrenPtr.value));
					state.prereqList(prereqs);
					// spread children must be Array<Roact.Element>
					state.prereq(createJsxAddArrayChildren(childrenPtr.value, amtSinceUpdate, lengthId, expression));
				} else {
					const type = state.getType(innerExp);
					if (isDefinitelyType(type, t => isRoactElementType(state, t))) {
						if (luau.isMixedTable(childrenPtr.value)) {
							luau.list.push(childrenPtr.value.fields, expression);
						} else {
							state.prereq(
								createJsxAddNumericChild(
									childrenPtr.value,
									lengthId,
									luau.number(amtSinceUpdate + 1),
									expression,
								),
							);
						}
						amtSinceUpdate++;
					} else {
						disableInline();
						assert(luau.isAnyIdentifier(childrenPtr.value));
						state.prereq(
							createJsxAddChild(state, childrenPtr.value, amtSinceUpdate, lengthId, expression, type),
						);
					}
				}
				if (!luau.isMixedTable(childrenPtr.value) && i < lastUsefulElementIndex) {
					updateLengthId();
				}
			}
		} else {
			const [expression, prereqs] = state.capture(() => transformExpression(state, child));
			if (!luau.list.isEmpty(prereqs)) {
				disableInline();
			}
			state.prereqList(prereqs);

			const keyInitializer = getKeyAttributeInitializer(child);
			if (keyInitializer) {
				const [key, keyPrereqs] = state.capture(() => transformExpression(state, keyInitializer));
				if (!luau.list.isEmpty(keyPrereqs)) {
					disableInline();
				}
				state.prereqList(keyPrereqs);
				assignToMixedTablePointer(state, childrenPtr, key, expression);
			} else {
				if (luau.isMixedTable(childrenPtr.value)) {
					luau.list.push(childrenPtr.value.fields, expression);
				} else {
					state.prereq(
						createJsxAddNumericChild(
							childrenPtr.value,
							lengthId,
							luau.number(amtSinceUpdate + 1),
							expression,
						),
					);
				}
				amtSinceUpdate++;
			}
		}
	}
}
