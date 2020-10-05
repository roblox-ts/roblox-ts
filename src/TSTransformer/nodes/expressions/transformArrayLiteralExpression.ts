import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { createArrayPointer, disableArrayInline } from "TSTransformer/util/pointer";
import {
	isArrayType,
	isDefinitelyType,
	isGeneratorType,
	isIterableFunctionLuaTupleType,
	isIterableFunctionType,
	isMapType,
	isSetType,
	isStringType,
} from "TSTransformer/util/types";

type OptimizeSpreadBuilder = (
	state: TransformState,
	expression: luau.Expression,
	arrayId: luau.AnyIdentifier,
	lengthId: luau.AnyIdentifier,
) => luau.Statement;

const optimizeArraySpread: OptimizeSpreadBuilder = (state, expression, arrayId, lengthId) => {
	const keyId = luau.tempId();
	const valueId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make(keyId, valueId),
		expression: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.ipairs,
			args: luau.list.make(expression),
		}),
		statements: luau.list.make(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: arrayId,
					index: luau.binary(lengthId, "+", keyId),
				}),
				operator: "=",
				right: valueId,
			}),
		),
	});
};

const optimizeStringSpread: OptimizeSpreadBuilder = (state, expression, arrayId, lengthId) => {
	const valueId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make(valueId),
		expression: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.string.gmatch,
			args: luau.list.make(expression, luau.globals.utf8.charpattern),
		}),
		statements: luau.list.make(
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(1),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: arrayId,
					index: lengthId,
				}),
				operator: "=",
				right: valueId,
			}),
		),
	});
};

const optimizeSetSpread: OptimizeSpreadBuilder = (state, expression, arrayId, lengthId) => {
	const valueId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make<luau.AnyIdentifier>(luau.emptyId(), valueId),
		expression: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.pairs,
			args: luau.list.make(expression),
		}),
		statements: luau.list.make(
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(1),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: arrayId,
					index: lengthId,
				}),
				operator: "=",
				right: valueId,
			}),
		),
	});
};

const optimizeMapSpread: OptimizeSpreadBuilder = (state, expression, arrayId, lengthId) => {
	const keyId = luau.tempId();
	const valueId = luau.tempId();
	const pairId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make<luau.AnyIdentifier>(keyId, valueId),
		expression: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.pairs,
			args: luau.list.make(expression),
		}),
		statements: luau.list.make<luau.Statement>(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: pairId,
				right: luau.array([keyId, valueId]),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(1),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: arrayId,
					index: lengthId,
				}),
				operator: "=",
				right: pairId,
			}),
		),
	});
};

const optimizeIterableFunctionSpread: OptimizeSpreadBuilder = (state, expression, arrayId, lengthId) => {
	const valueId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make<luau.AnyIdentifier>(valueId),
		expression,
		statements: luau.list.make<luau.Statement>(
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(1),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: arrayId,
					index: lengthId,
				}),
				operator: "=",
				right: valueId,
			}),
		),
	});
};

const optimizeIterableFunctionLuaTupleSpread: OptimizeSpreadBuilder = (state, expression, arrayId, lengthId) => {
	const iterFuncId = state.pushToVar(expression);
	const valueId = luau.tempId();
	return luau.create(luau.SyntaxKind.WhileStatement, {
		condition: luau.bool(true),
		statements: luau.list.make<luau.Statement>(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: valueId,
				right: luau.array([
					luau.create(luau.SyntaxKind.CallExpression, {
						expression: iterFuncId,
						args: luau.list.make(),
					}),
				]),
			}),
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: luau.binary(luau.unary("#", valueId), "==", luau.number(0)),
				statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
				elseBody: luau.list.make(),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(1),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: arrayId,
					index: lengthId,
				}),
				operator: "=",
				right: valueId,
			}),
		),
	});
};

const optimizeGeneratorSpread: OptimizeSpreadBuilder = (state, expression, arrayId, lengthId) => {
	const iterId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make<luau.AnyIdentifier>(iterId),
		expression: luau.property(convertToIndexableExpression(expression), "next"),
		statements: luau.list.make<luau.Statement>(
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: luau.property(iterId, "done"),
				statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
				elseBody: luau.list.make(),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(1),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: arrayId,
					index: lengthId,
				}),
				operator: "=",
				right: luau.property(iterId, "value"),
			}),
		),
	});
};

function getOptimizeSpreadBuilder(state: TransformState, type: ts.Type): OptimizeSpreadBuilder {
	if (isDefinitelyType(type, t => isArrayType(state, t))) {
		return optimizeArraySpread;
	} else if (isDefinitelyType(type, t => isStringType(t))) {
		return optimizeStringSpread;
	} else if (isDefinitelyType(type, t => isSetType(state, t))) {
		return optimizeSetSpread;
	} else if (isDefinitelyType(type, t => isMapType(state, t))) {
		return optimizeMapSpread;
	} else if (isDefinitelyType(type, t => isIterableFunctionLuaTupleType(state, t))) {
		return optimizeIterableFunctionLuaTupleSpread;
	} else if (isDefinitelyType(type, t => isIterableFunctionType(state, t))) {
		return optimizeIterableFunctionSpread;
	} else if (isDefinitelyType(type, t => isGeneratorType(state, t))) {
		return optimizeGeneratorSpread;
	}
	assert(false, "Not implemented");
}

export function transformArrayLiteralExpression(state: TransformState, node: ts.ArrayLiteralExpression) {
	if (!node.elements.find(element => ts.isSpreadElement(element))) {
		return luau.create(luau.SyntaxKind.Array, {
			members: luau.list.make(...ensureTransformOrder(state, node.elements)),
		});
	}

	const ptr = createArrayPointer();
	const lengthId = luau.tempId();
	let lengthInitialized = false;
	let amtElementsSinceUpdate = 0;

	function updateLengthId() {
		const right = luau.unary("#", ptr.value);
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
		amtElementsSinceUpdate = 0;
	}

	for (let i = 0; i < node.elements.length; i++) {
		const element = node.elements[i];
		if (ts.isSpreadElement(element)) {
			if (luau.isArray(ptr.value)) {
				disableArrayInline(state, ptr);
				updateLengthId();
			}
			assert(luau.isAnyIdentifier(ptr.value));

			const type = state.getType(element.expression);
			const optimizeSpreadBuilder = getOptimizeSpreadBuilder(state, type);
			const spreadExp = transformExpression(state, element.expression);
			state.prereq(optimizeSpreadBuilder(state, spreadExp, ptr.value, lengthId));

			if (i < node.elements.length - 1) {
				updateLengthId();
			}
		} else {
			const [expression, prereqs] = state.capture(() => transformExpression(state, element));
			if (luau.isArray(ptr.value) && !luau.list.isEmpty(prereqs)) {
				disableArrayInline(state, ptr);
				updateLengthId();
			}
			if (luau.isArray(ptr.value)) {
				luau.list.push(ptr.value.members, expression);
			} else {
				state.prereqList(prereqs);
				state.prereq(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: ptr.value,
							index: luau.binary(lengthId, "+", luau.number(amtElementsSinceUpdate + 1)),
						}),
						operator: "=",
						right: expression,
					}),
				);
			}
			amtElementsSinceUpdate++;
		}
	}

	return ptr.value;
}
