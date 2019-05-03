import * as ts from "ts-morph";
import {
	appendDeclarationIfMissing,
	compileCallArgumentsAndJoin,
	compileExpression,
	inheritsFromRoact,
	literalParameterCompileFunctions,
} from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { inheritsFrom } from "../typeUtilities";
import { suggest } from "../utility";

function compileSetMapConstructorHelper(
	state: CompilerState,
	node: ts.NewExpression,
	args: Array<ts.Expression>,
	type: "set" | "map",
) {
	const typeArgument = node.getType().getTypeArguments()[0];

	if (typeArgument.isNullable() || typeArgument.isUndefined()) {
		throw new CompilerError(
			`Cannot create a ${type} with a nullable index!`,
			node,
			CompilerErrorType.NullableIndexOnMapOrSet,
		);
	}

	const firstParam = args[0];

	if (
		firstParam &&
		(!ts.TypeGuards.isArrayLiteralExpression(firstParam) ||
			firstParam.getChildrenOfKind(ts.SyntaxKind.SpreadElement).length > 0)
	) {
		state.usesTSLibrary = true;
		return `TS.${type}_new(${compileCallArgumentsAndJoin(state, args)})`;
	} else {
		let result = "{";

		if (firstParam) {
			state.pushIndent();
			result += "\n" + literalParameterCompileFunctions.get(type)!(state, firstParam.getElements());
			state.popIndent();
			result += state.indent;
		}

		return result + "}";
	}
}

const ARRAY_NIL_LIMIT = 200;

export function compileNewExpression(state: CompilerState, node: ts.NewExpression) {
	const expNode = node.getExpression();
	const expressionType = expNode.getType();
	const name = compileExpression(state, expNode);
	const args = node.getFirstChildByKind(ts.SyntaxKind.OpenParenToken)
		? (node.getArguments() as Array<ts.Expression>)
		: [];

	if (inheritsFromRoact(expressionType)) {
		throw new CompilerError(
			`Roact components cannot be created using new\n` +
				suggest(`Proper usage: Roact.createElement(${name}), <${name}></${name}> or </${name}>`),
			node,
			CompilerErrorType.RoactNoNewComponentAllowed,
		);
	}

	if (inheritsFrom(expressionType, "ArrayConstructor")) {
		if (args.length === 0) {
			return "{}";
		}

		let result = `{`;
		if (args.length === 1) {
			const arg = args[0];
			if (
				ts.TypeGuards.isNumericLiteral(arg) &&
				arg.getText().match(/^\d+$/) &&
				arg.getLiteralValue() <= ARRAY_NIL_LIMIT
			) {
				const literalValue = arg.getLiteralValue();
				if (literalValue !== 0) {
					result += ", nil".repeat(literalValue).substring(1) + " ";
				}
			} else {
				throw new CompilerError(
					"Invalid argument #1 passed into ArrayConstructor. Expected a simple integer fewer or equal to " +
						ARRAY_NIL_LIMIT +
						".",
					node,
					CompilerErrorType.BadBuiltinConstructorCall,
				);
			}
		} else if (args.length !== 0) {
			throw new CompilerError(
				"Invalid arguments passed into ArrayConstructor!",
				node,
				CompilerErrorType.BadBuiltinConstructorCall,
			);
		}

		return appendDeclarationIfMissing(state, node.getParent(), result + `}`);
	}

	if (inheritsFrom(expressionType, "MapConstructor")) {
		return appendDeclarationIfMissing(
			state,
			node.getParent(),
			compileSetMapConstructorHelper(state, node, args, "map"),
		);
	}

	if (inheritsFrom(expressionType, "SetConstructor")) {
		return appendDeclarationIfMissing(
			state,
			node.getParent(),
			compileSetMapConstructorHelper(state, node, args, "set"),
		);
	}

	if (inheritsFrom(expressionType, "WeakMapConstructor")) {
		return `setmetatable(${compileSetMapConstructorHelper(state, node, args, "map")}, { __mode = "k" })`;
	}

	if (inheritsFrom(expressionType, "WeakSetConstructor")) {
		return `setmetatable(${compileSetMapConstructorHelper(state, node, args, "set")}, { __mode = "k" })`;
	}

	return `${name}.new(${compileCallArgumentsAndJoin(state, args)})`;
}
