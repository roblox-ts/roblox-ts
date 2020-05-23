import ts from "byots";
import * as tsst from "ts-simple-type";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";

function isBooleanType(type: tsst.SimpleType) {
	return type.kind === tsst.SimpleTypeKind.BOOLEAN || type.kind === tsst.SimpleTypeKind.BOOLEAN_LITERAL;
}

declare function canBeFalsy(node: ts.Expression): boolean;
export function transformConditionalExpression(state: TransformState, node: ts.ConditionalExpression) {
	if (isBooleanType(state.getSimpleTypeFromNode(node)) && !canBeFalsy(node.whenTrue)) {
		return lua.create(lua.SyntaxKind.ParenthesizedExpression, {
			expression: lua.create(lua.SyntaxKind.BinaryExpression, {
				left: lua.create(lua.SyntaxKind.BinaryExpression, {
					left: createTruthinessChecks(
						state,
						transformExpression(state, node.condition),
						state.getType(node.condition),
					),
					right: transformExpression(state, node.whenTrue),
					operator: "and",
				}),
				right: transformExpression(state, node.whenFalse),
				operator: "or",
			}),
		});
	}
	
	const tempId = lua.tempId();
	state.prereq(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: tempId,
			right: undefined,
		}),
	);

	const condition = createTruthinessChecks(
		state,
		transformExpression(state, node.condition),
		state.getType(node.condition),
	);

	const statements = state.capturePrereqs(() => {
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: tempId,
				right: transformExpression(state, node.whenTrue),
			}),
		);
	});

	const elseBody = state.capturePrereqs(() => {
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: tempId,
				right: transformExpression(state, node.whenFalse),
			}),
		);
	});

	state.prereq(
		lua.create(lua.SyntaxKind.IfStatement, {
			condition,
			statements,
			elseBody,
		}),
	);

	return tempId;
}
