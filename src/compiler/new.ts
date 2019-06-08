import * as ts from "ts-morph";
import { appendDeclarationIfMissing, compileCallArgumentsAndJoin, compileExpression, inheritsFromRoact } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { inheritsFrom, isTupleType } from "../typeUtilities";
import { getNonNullUnParenthesizedExpressionUpwards, joinIndentedLines, suggest } from "../utility";
import { compileCallArguments } from "./call";
import { getReadableExpressionName } from "./indexed";

function compileMapElement(state: CompilerState, element: ts.Expression) {
	if (ts.TypeGuards.isArrayLiteralExpression(element)) {
		const [key, value] = compileCallArguments(state, element.getElements());
		return `[${key}] = ${value};\n`;
	} else if (ts.TypeGuards.isCallExpression(element) && isTupleType(element.getReturnType())) {
		const key = state.getNewId();
		const value = state.getNewId();
		state.pushPrecedingStatementToNewId(
			element,
			compileExpression(state, element).slice(2, -2),
			`${key}, ${value}`,
		);
		return `[${key}] = ${value};\n`;
	} else {
		const id = getReadableExpressionName(state, element, compileExpression(state, element));
		return `[${id}[1]] = ${id}[2];\n`;
	}
}

function compileSetElement(state: CompilerState, element: ts.Expression) {
	const [key] = compileCallArguments(state, [element]);
	return `[${key}] = true;\n`;
}

const compileMapSetElement = new Map<
	"set" | "map",
	{ addMethodName: string; compile: (state: CompilerState, element: ts.Expression) => string }
>([
	["map", { compile: compileMapElement, addMethodName: "set" }],
	["set", { compile: compileSetElement, addMethodName: "add" }],
]);

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
		let id = "";
		const lines = new Array<string>();
		let hasContext = false;

		const { compile: compileElement, addMethodName: addMethodName } = compileMapSetElement.get(type)!;

		let exp: ts.Node = node;
		let parent = getNonNullUnParenthesizedExpressionUpwards(node.getParent());

		while (ts.TypeGuards.isPropertyAccessExpression(parent) && addMethodName === parent.getName()) {
			const grandparent = getNonNullUnParenthesizedExpressionUpwards(parent.getParent());
			if (ts.TypeGuards.isCallExpression(grandparent)) {
				exp = grandparent;
				parent = getNonNullUnParenthesizedExpressionUpwards(grandparent.getParent());
			} else {
				break;
			}
		}

		if (firstParam) {
			for (const element of firstParam.getElements()) {
				if (hasContext) {
					state.pushPrecedingStatements(exp, id + compileElement(state, element));
				} else {
					state.enterPrecedingStatementContext();
					const line = compileElement(state, element);
					const context = state.exitPrecedingStatementContext();

					if (context.length > 0) {
						hasContext = true;
						id = state.pushToDeclarationOrNewId(exp, "{}", declaration => declaration.isIdentifier);
						state.pushPrecedingStatements(
							exp,
							...lines.map(current => state.indent + id + current),
							...context,
							state.indent + id + line,
						);
					} else {
						lines.push(line);
					}
				}
			}
		}

		if (!hasContext) {
			id = state.pushToDeclarationOrNewId(
				exp,
				lines.length === 0
					? "{}"
					: lines.reduce((result, line) => result + state.indent + joinIndentedLines([line], 1), "{\n") +
							state.indent +
							"}",

				ts.TypeGuards.isNewExpression(exp) ? () => true : declaration => declaration.isIdentifier,
			);
		}

		state.getCurrentPrecedingStatementContext(node).isPushed = true;
		return id;
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
