import * as ts from "ts-morph";
import {
	appendDeclarationIfMissing,
	compileCallArguments,
	compileCallArgumentsAndJoin,
	compileExpression,
	getReadableExpressionName,
	inheritsFromRoact,
} from ".";
import { CompilerState, DeclarationContext } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { joinIndentedLines, skipNodesDownwards, skipNodesUpwards } from "../utility/general";
import { suggest } from "../utility/text";
import { getType, inheritsFrom, isTupleType } from "../utility/type";

function compileMapElement(state: CompilerState, element: ts.Expression) {
	if (ts.TypeGuards.isArrayLiteralExpression(element)) {
		const [key, value] = compileCallArguments(
			state,
			element.getElements().map(e => skipNodesDownwards(e)),
		);
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
	{
		addMethodName: string;
		compile: (state: CompilerState, element: ts.Expression) => string;
	}
>([
	["map", { compile: compileMapElement, addMethodName: "set" }],
	["set", { compile: compileSetElement, addMethodName: "add" }],
]);

function compileSetMapConstructorHelper(
	state: CompilerState,
	node: ts.NewExpression,
	args: Array<ts.Expression>,
	type: "set" | "map",
	mode: "" | "k" | "v" | "kv" = "",
) {
	const preDeclaration = mode ? "setmetatable(" : "";
	const postDeclaration = mode ? `, { __mode = "${mode}" })` : "";

	const typeArgument = getType(node).getTypeArguments()[0];

	if (typeArgument.isNullable() || typeArgument.isUndefined()) {
		throw new CompilerError(
			`Cannot create a ${type} with a nullable index!`,
			node,
			CompilerErrorType.NullableIndexOnMapOrSet,
		);
	}

	const firstParam = skipNodesDownwards(args[0]) as ts.Expression | undefined;

	let exp: ts.Node = node;
	let parent = skipNodesUpwards(node.getParent());
	const { compile: compileElement, addMethodName: addMethodName } = compileMapSetElement.get(type)!;

	while (ts.TypeGuards.isPropertyAccessExpression(parent) && addMethodName === parent.getName()) {
		const grandparent = skipNodesUpwards(parent.getParent()!);
		if (ts.TypeGuards.isCallExpression(grandparent)) {
			exp = grandparent;
			parent = skipNodesUpwards(grandparent.getParent()!);
		} else {
			break;
		}
	}

	const pushCondition = ts.TypeGuards.isNewExpression(exp)
		? () => true
		: (declaration: DeclarationContext) => declaration.isIdentifier;

	if (
		firstParam &&
		(!ts.TypeGuards.isArrayLiteralExpression(firstParam) ||
			firstParam.getChildrenOfKind(ts.SyntaxKind.SpreadElement).length > 0)
	) {
		state.usesTSLibrary = true;
		const id = state.pushToDeclarationOrNewId(
			exp,
			preDeclaration + `TS.${type}_new(${compileCallArgumentsAndJoin(state, args)})` + postDeclaration,
			pushCondition,
		);
		return id;
	} else {
		let id = "";
		const lines = new Array<string>();
		let hasContext = false;

		if (firstParam) {
			for (let element of firstParam.getElements()) {
				element = skipNodesDownwards(element);
				if (hasContext) {
					state.pushPrecedingStatements(exp, id + compileElement(state, element));
				} else {
					state.enterPrecedingStatementContext();
					const line = compileElement(state, element);
					const context = state.exitPrecedingStatementContext();

					if (context.length > 0) {
						hasContext = true;
						id = state.pushToDeclarationOrNewId(
							exp,
							preDeclaration + "{}" + postDeclaration,
							declaration => declaration.isIdentifier,
						);
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
					? preDeclaration + "{}" + postDeclaration
					: preDeclaration +
							lines.reduce(
								(result, line) => result + state.indent + joinIndentedLines([line], 1),
								"{\n",
							) +
							state.indent +
							"}" +
							postDeclaration,

				pushCondition,
			);
		}

		return id;
	}
}

export function compileNewExpression(state: CompilerState, node: ts.NewExpression) {
	const expNode = skipNodesDownwards(node.getExpression());
	const expressionType = getType(expNode);
	const name = compileExpression(state, expNode);
	const args = node.getFirstChildByKind(ts.SyntaxKind.OpenParenToken)
		? (node.getArguments().map(arg => skipNodesDownwards(arg)) as Array<ts.Expression>)
		: [];

	if (inheritsFromRoact(expressionType)) {
		throw new CompilerError(
			`Roact components cannot be created using new\n` +
				suggest(`Proper usage: Roact.createElement(${name}), <${name}></${name}> or <${name}/>`),
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
			const [length] = compileCallArguments(state, args);
			result = "table.create(" + length + ")";
			return appendDeclarationIfMissing(state, skipNodesUpwards(node.getParent()), result);
		} else if (args.length === 2) {
			const [length, value] = compileCallArguments(state, args);

			result = "table.create(" + length + ", " + value + ")";
			return appendDeclarationIfMissing(state, skipNodesUpwards(node.getParent()), result);
		} else if (args.length !== 0) {
			throw new CompilerError(
				"Invalid arguments passed into ArrayConstructor!",
				node,
				CompilerErrorType.BadBuiltinConstructorCall,
			);
		}

		return appendDeclarationIfMissing(state, skipNodesUpwards(node.getParent()), result + `}`);
	}

	if (inheritsFrom(expressionType, "MapConstructor") || inheritsFrom(expressionType, "ReadonlyMapConstructor")) {
		return appendDeclarationIfMissing(
			state,
			skipNodesUpwards(node.getParent()),
			compileSetMapConstructorHelper(state, node, args, "map"),
		);
	}

	if (inheritsFrom(expressionType, "SetConstructor") || inheritsFrom(expressionType, "ReadonlySetConstructor")) {
		return appendDeclarationIfMissing(
			state,
			skipNodesUpwards(node.getParent()),
			compileSetMapConstructorHelper(state, node, args, "set"),
		);
	}

	if (inheritsFrom(expressionType, "WeakMapConstructor")) {
		return appendDeclarationIfMissing(
			state,
			skipNodesUpwards(node.getParent()),
			compileSetMapConstructorHelper(state, node, args, "map", "k"),
		);
	}

	if (inheritsFrom(expressionType, "WeakSetConstructor")) {
		return appendDeclarationIfMissing(
			state,
			skipNodesUpwards(node.getParent()),
			compileSetMapConstructorHelper(state, node, args, "set", "k"),
		);
	}

	return `${name}.new(${compileCallArgumentsAndJoin(state, args)})`;
}
