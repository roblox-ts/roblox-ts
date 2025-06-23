import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import {
	isArrayType,
	isDefinitelyType,
	isGeneratorType,
	isIterableFunctionLuaTupleType,
	isIterableFunctionType,
	isIterableType,
	isMapType,
	isSetType,
	isSharedTableType,
	isStringType,
} from "TSTransformer/util/types";
import { valueToIdStr } from "TSTransformer/util/valueToIdStr";
import ts from "typescript";

type AddIterableToArrayBuilder = (
	state: TransformState,
	expression: luau.Expression,
	arrayId: luau.AnyIdentifier,
	lengthId: luau.AnyIdentifier,
	amtElementsSinceUpdate: number,
	shouldUpdateLengthId: boolean,
) => luau.List<luau.Statement>;

const addArray: AddIterableToArrayBuilder = (
	state,
	expression,
	arrayId,
	lengthId,
	amtElementsSinceUpdate,
	shouldUpdateLengthId,
) => {
	const result = luau.list.make<luau.Statement>();

	const inputArray = state.pushToVarIfNonId(expression, "array");
	let inputLength: luau.Expression = luau.unary("#", inputArray);
	if (shouldUpdateLengthId) {
		inputLength = state.pushToVar(inputLength, valueToIdStr(inputArray) + "Length");
	}

	luau.list.push(
		result,
		luau.create(luau.SyntaxKind.CallStatement, {
			expression: luau.call(luau.globals.table.move, [
				inputArray,
				luau.number(1),
				inputLength,
				luau.binary(lengthId, "+", luau.number(amtElementsSinceUpdate + 1)),
				arrayId,
			]),
		}),
	);

	if (shouldUpdateLengthId) {
		luau.list.push(
			result,
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: inputLength,
			}),
		);
	}

	return result;
};

const addString: AddIterableToArrayBuilder = (state, expression, arrayId, lengthId, amtElementsSinceUpdate) => {
	const result = luau.list.make<luau.Statement>();

	if (amtElementsSinceUpdate > 0) {
		luau.list.push(
			result,
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(amtElementsSinceUpdate),
			}),
		);
	}

	const valueId = luau.tempId("char");
	luau.list.push(
		result,
		luau.create(luau.SyntaxKind.ForStatement, {
			ids: luau.list.make(valueId),
			expression: luau.call(luau.globals.string.gmatch, [expression, luau.globals.utf8.charpattern]),
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
		}),
	);

	return result;
};

const addSet: AddIterableToArrayBuilder = (state, expression, arrayId, lengthId, amtElementsSinceUpdate) => {
	const result = luau.list.make<luau.Statement>();

	if (amtElementsSinceUpdate > 0) {
		luau.list.push(
			result,
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(amtElementsSinceUpdate),
			}),
		);
	}

	const valueId = luau.tempId("v");

	luau.list.push(
		result,
		luau.create(luau.SyntaxKind.ForStatement, {
			ids: luau.list.make(valueId),
			expression,
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
		}),
	);

	return result;
};

const addMap: AddIterableToArrayBuilder = (state, expression, arrayId, lengthId, amtElementsSinceUpdate) => {
	const result = luau.list.make<luau.Statement>();

	if (amtElementsSinceUpdate > 0) {
		luau.list.push(
			result,
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(amtElementsSinceUpdate),
			}),
		);
	}

	const keyId = luau.tempId("k");
	const valueId = luau.tempId("v");
	luau.list.push(
		result,
		luau.create(luau.SyntaxKind.ForStatement, {
			ids: luau.list.make(keyId, valueId),
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
					right: luau.array([keyId, valueId]),
				}),
			),
		}),
	);

	return result;
};

const addIterableFunction: AddIterableToArrayBuilder = (
	state,
	expression,
	arrayId,
	lengthId,
	amtElementsSinceUpdate,
) => {
	const result = luau.list.make<luau.Statement>();

	if (amtElementsSinceUpdate > 0) {
		luau.list.push(
			result,
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(amtElementsSinceUpdate),
			}),
		);
	}

	const valueId = luau.tempId("result");

	luau.list.push(
		result,
		luau.create(luau.SyntaxKind.ForStatement, {
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
		}),
	);

	return result;
};

const addIterableFunctionLuaTuple: AddIterableToArrayBuilder = (
	state,
	expression,
	arrayId,
	lengthId,
	amtElementsSinceUpdate,
) => {
	const result = luau.list.make<luau.Statement>();

	if (amtElementsSinceUpdate > 0) {
		luau.list.push(
			result,
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(amtElementsSinceUpdate),
			}),
		);
	}

	const iterFuncId = state.pushToVar(expression, "iterFunc");
	const valueId = luau.tempId("results");
	luau.list.push(
		result,
		luau.create(luau.SyntaxKind.WhileStatement, {
			condition: luau.bool(true),
			statements: luau.list.make<luau.Statement>(
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: valueId,
					right: luau.array([luau.call(iterFuncId)]),
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
		}),
	);

	return result;
};

const addGenerator: AddIterableToArrayBuilder = (state, expression, arrayId, lengthId, amtElementsSinceUpdate) => {
	const result = luau.list.make<luau.Statement>();

	if (amtElementsSinceUpdate > 0) {
		luau.list.push(
			result,
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(amtElementsSinceUpdate),
			}),
		);
	}

	const iterId = luau.tempId("result");
	luau.list.push(
		result,
		luau.create(luau.SyntaxKind.ForStatement, {
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
		}),
	);

	return result;
};

export function getAddIterableToArrayBuilder(
	state: TransformState,
	node: ts.Node,
	type: ts.Type,
): AddIterableToArrayBuilder {
	if (isDefinitelyType(type, isArrayType(state))) {
		return addArray;
	} else if (isDefinitelyType(type, isStringType)) {
		return addString;
	} else if (isDefinitelyType(type, isSetType(state))) {
		return addSet;
	} else if (isDefinitelyType(type, isMapType(state)) || isDefinitelyType(type, isSharedTableType(state))) {
		return addMap;
	} else if (isDefinitelyType(type, isIterableFunctionLuaTupleType(state))) {
		return addIterableFunctionLuaTuple;
	} else if (isDefinitelyType(type, isIterableFunctionType(state))) {
		return addIterableFunction;
	} else if (isDefinitelyType(type, isGeneratorType(state))) {
		return addGenerator;
	} else if (isDefinitelyType(type, isIterableType(state))) {
		DiagnosticService.addDiagnostic(errors.noIterableIteration(node));
		return () => luau.list.make();
	} else if (type.isUnion()) {
		DiagnosticService.addDiagnostic(errors.noMacroUnion(node));
		return () => luau.list.make();
	} else {
		assert(false, `Iteration type not implemented: ${state.typeChecker.typeToString(type)}`);
	}
}
