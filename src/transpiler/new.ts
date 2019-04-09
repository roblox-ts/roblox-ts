import * as ts from "ts-morph";
import { inheritsFromRoact, transpileCallArguments, transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { inheritsFrom } from "../typeUtilities";
import { suggest } from "../utility";
import { literalParameterTranspileFunctions } from "./call";
import { appendDeclarationIfMissing } from "./expression";

function transpileSetMapConstructorHelper(
	state: TranspilerState,
	node: ts.NewExpression,
	args: Array<ts.Node>,
	type: "set" | "map",
) {
	const firstParam = args[0];

	if (firstParam && !ts.TypeGuards.isArrayLiteralExpression(firstParam)) {
		state.usesTSLibrary = true;
		return `TS.${type}_new(${transpileCallArguments(state, args)})`;
	} else {
		let result = "{";

		if (firstParam) {
			state.pushIndent();
			result += "\n" + literalParameterTranspileFunctions.get(type)!(state, firstParam.getElements());
			state.popIndent();
			result += state.indent;
		}

		return result + "}";
	}
}

const ARRAY_NIL_LIMIT = 200;

export function transpileNewExpression(state: TranspilerState, node: ts.NewExpression) {
	const expNode = node.getExpression();
	const expressionType = expNode.getType();
	const name = transpileExpression(state, expNode);
	const args = node.getFirstChildByKind(ts.SyntaxKind.OpenParenToken) ? node.getArguments() : [];

	if (inheritsFromRoact(expressionType)) {
		throw new TranspilerError(
			`Roact components cannot be created using new\n` +
				suggest(`Proper usage: Roact.createElement(${name}), <${name}></${name}> or </${name}>`),
			node,
			TranspilerErrorType.RoactNoNewComponentAllowed,
		);
	}

	if (inheritsFrom(expressionType, "ArrayConstructor")) {
		let result = `{`;
		if (args.length === 1) {
			const arg = args[0];
			if (
				ts.TypeGuards.isNumericLiteral(arg) &&
				arg.getText().match(/^\d+$/) &&
				arg.getLiteralValue() <= ARRAY_NIL_LIMIT
			) {
				result += ", nil".repeat(arg.getLiteralValue()).substring(1);
			} else {
				throw new TranspilerError(
					"Invalid argument #1 passed into ArrayConstructor. Expected a simple integer fewer or equal to " +
						ARRAY_NIL_LIMIT +
						".",
					node,
					TranspilerErrorType.BadBuiltinConstructorCall,
				);
			}
		} else if (args.length !== 0) {
			throw new TranspilerError(
				"Invalid arguments passed into ArrayConstructor!",
				node,
				TranspilerErrorType.BadBuiltinConstructorCall,
			);
		}

		return appendDeclarationIfMissing(state, node.getParent(), result + ` }`);
	}

	if (inheritsFrom(expressionType, "MapConstructor")) {
		return appendDeclarationIfMissing(
			state,
			node.getParent(),
			transpileSetMapConstructorHelper(state, node, args, "map"),
		);
	}

	if (inheritsFrom(expressionType, "SetConstructor")) {
		return appendDeclarationIfMissing(
			state,
			node.getParent(),
			transpileSetMapConstructorHelper(state, node, args, "set"),
		);
	}

	if (inheritsFrom(expressionType, "WeakMapConstructor")) {
		return `setmetatable(${transpileSetMapConstructorHelper(state, node, args, "map")}, { __mode = "k" })`;
	}

	if (inheritsFrom(expressionType, "WeakSetConstructor")) {
		return `setmetatable(${transpileSetMapConstructorHelper(state, node, args, "set")}, { __mode = "k" })`;
	}

	return `${name}.new(${transpileCallArguments(state, args)})`;
}
