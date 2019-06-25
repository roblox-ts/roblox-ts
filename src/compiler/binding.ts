import * as ts from "ts-morph";
import {
	checkPropertyCollision,
	compileExpression,
	compileIdentifier,
	CompilerDirective,
	getComputedPropertyAccess,
	isIdentifierDefinedInExportLet,
} from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { HasParameters } from "../types";
import {
	getCompilerDirectiveWithLaxConstraint,
	getType,
	isArrayMethodType,
	isArrayType,
	isIterableFunction,
	isIterableIterator,
	isMapMethodType,
	isMapType,
	isObjectType,
	isSetMethodType,
	isSetType,
	isStringMethodType,
	isStringType,
} from "../typeUtilities";
import { joinIndentedLines, safeLuaIndex, skipNodesDownwards } from "../utility";
import { checkReserved } from "./security";

function compileParamDefault(state: CompilerState, exp: ts.Expression, name: string) {
	const initializer = skipNodesDownwards(exp);
	state.enterPrecedingStatementContext();

	state.declarationContext.set(initializer, {
		isIdentifier: ts.TypeGuards.isIdentifier(initializer) && !isIdentifierDefinedInExportLet(initializer),
		set: name,
	});
	const expStr = compileExpression(state, initializer);
	const context = state.exitPrecedingStatementContext();

	state.pushIndent();

	const declaration = state.declarationContext.delete(initializer) ? `${name} = ${expStr};` : "";
	let newline: string;
	let indentation: string;
	let tab: string;
	let contextLines: string;

	if (context.length > (declaration ? 0 : 1)) {
		newline = "\n";
		indentation = state.indent;
		tab = "\t";
		contextLines = joinIndentedLines(context, 2);
	} else {
		newline = " ";
		indentation = "";
		tab = "";
		contextLines = joinIndentedLines(context, 0).replace(/\n/g, " ");
	}

	state.popIndent();

	return "if ".concat(
		name,
		" == nil then",
		newline,
		contextLines,
		indentation,
		declaration ? tab + `${declaration}` + newline + indentation : "",
		"end;",
	);
}

export function getParameterData(
	state: CompilerState,
	paramNames: Array<string>,
	initializers: Array<string>,
	node: HasParameters,
	defaults?: Array<string>,
) {
	for (const param of node.getParameters()) {
		const child = param.getFirstChild(
			exp =>
				ts.TypeGuards.isIdentifier(exp) ||
				ts.TypeGuards.isArrayBindingPattern(exp) ||
				ts.TypeGuards.isObjectBindingPattern(exp),
		);

		/* istanbul ignore next */
		if (child === undefined) {
			throw new CompilerError(
				"Child missing from parameter!",
				param,
				CompilerErrorType.ParameterChildMissing,
				true,
			);
		}

		let name: string;
		if (ts.TypeGuards.isIdentifier(child)) {
			if (param.getName() === "this") {
				continue;
			}
			name = compileExpression(state, child);
			checkReserved(name, child);
		} else {
			name = state.getNewId();
		}

		if (param.isRestParameter()) {
			paramNames.push("...");
			initializers.push(`local ${name} = { ... };`);
		} else {
			paramNames.push(name);
		}

		if (param.hasInitializer()) {
			(defaults ? defaults : initializers).push(compileParamDefault(state, param.getInitializer()!, name));
		}

		if (param.hasScopeKeyword() || param.isReadonly()) {
			const classDec = node.getParent();
			if (ts.TypeGuards.isClassDeclaration(classDec) || ts.TypeGuards.isClassExpression(classDec)) {
				checkPropertyCollision(classDec, param);
			}

			initializers.push(`${safeLuaIndex("self", name)} = ${name};`);
		}

		if (ts.TypeGuards.isArrayBindingPattern(child) || ts.TypeGuards.isObjectBindingPattern(child)) {
			const names = new Array<string>();
			const values = new Array<string>();
			const preStatements = new Array<string>();
			const postStatements = new Array<string>();
			getBindingData(state, names, values, preStatements, postStatements, child, name);
			preStatements.forEach(statement => initializers.push(statement));
			concatNamesAndValues(state, names, values, true, declaration => initializers.push(declaration), false);
			postStatements.forEach(statement => initializers.push(statement));
		}
	}
}

function arrayAccessor(state: CompilerState, t: string, key: number) {
	return `${t}[${key}]`;
}

function objectAccessor(
	state: CompilerState,
	t: string,
	node: ts.Node,
	getAccessor: (
		state: CompilerState,
		t: string,
		key: number,
		preStatements: Array<string>,
		idStack: Array<string>,
	) => string,
	nameNode: ts.Node = node,
	aliasNode: ts.Node = node,
): string {
	let name: string;

	if (ts.TypeGuards.isShorthandPropertyAssignment(nameNode)) {
		nameNode = nameNode.getNameNode();
	}

	const rhs = node
		.getFirstAncestorOrThrow(
			ancestor =>
				ts.TypeGuards.isObjectLiteralExpression(ancestor) || ts.TypeGuards.isObjectBindingPattern(ancestor),
		)
		.getParentOrThrow()
		.getLastChildOrThrow(() => true);

	if (ts.TypeGuards.isIdentifier(nameNode)) {
		name = compileExpression(state, nameNode);
	} else if (ts.TypeGuards.isComputedPropertyName(nameNode)) {
		const exp = skipNodesDownwards(nameNode.getExpression());
		name = getComputedPropertyAccess(state, exp, rhs);
		return `${t}[${name}]`;
	} else if (ts.TypeGuards.isNumericLiteral(nameNode) || ts.TypeGuards.isStringLiteral(nameNode)) {
		name = compileExpression(state, nameNode);
		return `${t}[${name}]`;
	} else {
		throw new CompilerError(
			`Cannot index an object with type ${nameNode.getKindName()}.`,
			nameNode,
			CompilerErrorType.BadExpression,
			true,
		);
	}

	if (getAccessor) {
		const type = getType(aliasNode);
		if (isArrayMethodType(type) || isMapMethodType(type) || isSetMethodType(type) || isStringMethodType(type)) {
			throw new CompilerError(
				`Cannot index method ${name} (a roblox-ts internal)`,
				aliasNode,
				CompilerErrorType.BadDestructuringType,
			);
		}
	}

	// We need this because length is built-in to the TS compiler, even if we removed it from our types
	if (
		getCompilerDirectiveWithLaxConstraint(getType(rhs), CompilerDirective.Array, r => r.isTuple()) &&
		name === "length"
	) {
		throw new CompilerError(
			`Cannot access the \`length\` property of a tuple! Instead use \`${rhs.getText()}.size()\``,
			node,
			CompilerErrorType.TupleLength,
		);
	}

	return safeLuaIndex(t, name);
}

function stringAccessor(state: CompilerState, t: string, key: number) {
	return `${t}:sub(${key}, ${key})`;
}

function setAccessor(
	state: CompilerState,
	t: string,
	key: number,
	preStatements: Array<string>,
	idStack: Array<string>,
) {
	const id = state.getNewId();
	const lastId = idStack[idStack.length - 1] as string | undefined;
	if (lastId !== undefined) {
		preStatements.push(`local ${id} = next(${t}, ${lastId})`);
	} else {
		preStatements.push(`local ${id} = next(${t})`);
	}
	idStack.push(id);
	return id;
}

function mapAccessor(
	state: CompilerState,
	t: string,
	key: number,
	preStatements: Array<string>,
	idStack: Array<string>,
	isHole = false,
) {
	const keyId = state.getNewId();
	const lastId = idStack[idStack.length - 1] as string | undefined;

	let valueId: string;
	let valueIdStr = "";
	if (!isHole) {
		valueId = state.getNewId();
		valueIdStr = `, ${valueId}`;
	}

	if (lastId !== undefined) {
		preStatements.push(`local ${keyId}${valueIdStr} = next(${t}, ${lastId})`);
	} else {
		preStatements.push(`local ${keyId}${valueIdStr} = next(${t})`);
	}
	idStack.push(keyId);
	return `{ ${keyId}${valueIdStr} }`;
}

function iterAccessor(
	state: CompilerState,
	t: string,
	key: number,
	preStatements: Array<string>,
	idStack: Array<string>,
	isHole = false,
) {
	if (isHole) {
		preStatements.push(`${t}.next()`);
		return "";
	} else {
		const id = state.getNewId();
		preStatements.push(`local ${id} = ${t}.next();`);
		return `${id}.value`;
	}
}

function iterableFunctionAccessor(
	state: CompilerState,
	t: string,
	key: number,
	preStatements: Array<string>,
	idStack: Array<string>,
	isHole = false,
) {
	if (isHole) {
		preStatements.push(`${t}()`);
		return "";
	} else {
		return `${t}()`;
	}
}

export function getAccessorForBindingPatternType(bindingPattern: ts.Node) {
	const bindingPatternType = getType(bindingPattern);
	if (isArrayType(bindingPatternType)) {
		return arrayAccessor;
	} else if (isStringType(bindingPatternType)) {
		return stringAccessor;
	} else if (isSetType(bindingPatternType)) {
		return setAccessor;
	} else if (isMapType(bindingPatternType)) {
		return mapAccessor;
	} else if (isIterableFunction(bindingPatternType)) {
		return iterableFunctionAccessor;
	} else if (
		isIterableIterator(bindingPatternType, bindingPattern) ||
		isObjectType(bindingPatternType) ||
		ts.TypeGuards.isThisExpression(bindingPattern) ||
		ts.TypeGuards.isSuperExpression(bindingPattern)
	) {
		return iterAccessor;
	} else {
		if (bindingPattern.getKind() === ts.SyntaxKind.ObjectBindingPattern) {
			return null as never;
		} else {
			throw new CompilerError(
				`Cannot destructure an object of type ${bindingPatternType.getText()}`,
				bindingPattern,
				CompilerErrorType.BadDestructuringType,
			);
		}
	}
}

export function concatNamesAndValues(
	state: CompilerState,
	names: Array<string>,
	values: Array<string>,
	isLocal: boolean,
	func: (str: string) => void,
	includeSpacing = true,
	includeSemicolon = true,
) {
	if (values.length > 0) {
		names[0] = names[0] || "_";
		func(
			`${includeSpacing ? state.indent : ""}${isLocal ? "local " : ""}${names.join(", ")} = ${values.join(", ")}${
				includeSemicolon ? ";" : ""
			}${includeSpacing ? "\n" : ""}`,
		);
	}
}

export function getBindingData(
	state: CompilerState,
	names: Array<string>,
	values: Array<string>,
	preStatements: Array<string>,
	postStatements: Array<string>,
	bindingPattern: ts.Node,
	parentId: string,
	getAccessor = getAccessorForBindingPatternType(bindingPattern),
) {
	const idStack = new Array<string>();
	const strKeys = bindingPattern.getKind() === ts.SyntaxKind.ObjectBindingPattern;
	let childIndex = 1;
	for (const item of bindingPattern.getFirstChildByKindOrThrow(ts.SyntaxKind.SyntaxList).getChildren()) {
		if (ts.TypeGuards.isBindingElement(item)) {
			const [child, op, pattern] = item.getChildren();

			if (child.getKind() === ts.SyntaxKind.DotDotDotToken) {
				throw new CompilerError(
					"Operator ... is not supported for destructuring!",
					child,
					CompilerErrorType.SpreadDestructuring,
				);
			}

			if (
				pattern &&
				(ts.TypeGuards.isArrayBindingPattern(pattern) || ts.TypeGuards.isObjectBindingPattern(pattern))
			) {
				const childId = state.getNewId();
				const accessor: string = strKeys
					? objectAccessor(state, parentId, child, getAccessor)
					: getAccessor(state, parentId, childIndex, preStatements, idStack);
				preStatements.push(`local ${childId} = ${accessor};`);
				getBindingData(state, names, values, preStatements, postStatements, pattern, childId);
			} else if (ts.TypeGuards.isArrayBindingPattern(child)) {
				const childId = state.getNewId();
				const accessor: string = strKeys
					? objectAccessor(state, parentId, child, getAccessor)
					: getAccessor(state, parentId, childIndex, preStatements, idStack);
				preStatements.push(`local ${childId} = ${accessor};`);
				getBindingData(state, names, values, preStatements, postStatements, child, childId);
			} else if (ts.TypeGuards.isIdentifier(child)) {
				const idNode = pattern && ts.TypeGuards.isIdentifier(pattern) ? pattern : child;
				const id: string = checkReserved(compileIdentifier(state, idNode), idNode);
				names.push(id);
				if (op && op.getKind() === ts.SyntaxKind.EqualsToken) {
					postStatements.push(compileParamDefault(state, pattern as ts.Expression, id));
				}
				const accessor: string = strKeys
					? objectAccessor(state, parentId, child, getAccessor, child, idNode)
					: getAccessor(state, parentId, childIndex, preStatements, idStack);
				values.push(accessor);
			} else if (ts.TypeGuards.isObjectBindingPattern(child)) {
				const childId = state.getNewId();
				const accessor: string = strKeys
					? objectAccessor(state, parentId, child, getAccessor)
					: getAccessor(state, parentId, childIndex, preStatements, idStack);
				preStatements.push(`local ${childId} = ${accessor};`);
				getBindingData(state, names, values, preStatements, postStatements, child, childId);
			} else if (ts.TypeGuards.isComputedPropertyName(child)) {
				const expStr = getComputedPropertyAccess(
					state,
					skipNodesDownwards(child.getExpression()),
					bindingPattern,
				);
				const accessor = `${parentId}[${expStr}]`;
				const childId: string = compileExpression(state, pattern as ts.Expression);
				if (ts.TypeGuards.isIdentifier(pattern)) {
					checkReserved(childId, pattern);
				}
				preStatements.push(`local ${childId} = ${accessor};`);
			} else if (child.getKind() !== ts.SyntaxKind.CommaToken && !ts.TypeGuards.isOmittedExpression(child)) {
				throw new CompilerError(
					`Unexpected ${child.getKindName()} in getBindingData.`,
					child,
					CompilerErrorType.UnexpectedBindingPattern,
					true,
				);
			}
		} else if (ts.TypeGuards.isIdentifier(item)) {
			/*
			let a: number;
			[a] = [0];
			*/
			const id = compileExpression(state, item as ts.Expression);
			names.push(id);
			values.push(getAccessor(state, parentId, childIndex, preStatements, idStack));
		} else if (ts.TypeGuards.isPropertyAccessExpression(item)) {
			const id = compileExpression(state, item as ts.Expression);
			names.push(id);
			values.push(getAccessor(state, parentId, childIndex, preStatements, idStack));
		} else if (ts.TypeGuards.isArrayLiteralExpression(item)) {
			const childId = state.getNewId();
			preStatements.push(
				`local ${childId} = ${getAccessor(state, parentId, childIndex, preStatements, idStack)};`,
			);
			getBindingData(state, names, values, preStatements, postStatements, item, childId);
		} else if (item.getKind() === ts.SyntaxKind.CommaToken) {
			childIndex--;
		} else if (ts.TypeGuards.isObjectLiteralExpression(item)) {
			const childId = state.getNewId();
			preStatements.push(
				`local ${childId} = ${getAccessor(state, parentId, childIndex, preStatements, idStack)};`,
			);
			getBindingData(state, names, values, preStatements, postStatements, item, childId);
		} else if (ts.TypeGuards.isShorthandPropertyAssignment(item)) {
			preStatements.push(`${item.getName()} = ${objectAccessor(state, parentId, item, getAccessor)};`);
		} else if (ts.TypeGuards.isPropertyAssignment(item)) {
			let alias: string;
			const nameNode = item.getNameNode();
			if (item.hasInitializer()) {
				const initializer = skipNodesDownwards(item.getInitializer()!);
				if (
					ts.TypeGuards.isIdentifier(initializer) ||
					ts.TypeGuards.isPropertyAccessExpression(initializer) ||
					ts.TypeGuards.isElementAccessExpression(initializer)
				) {
					alias = compileExpression(state, initializer);
					preStatements.push(`${alias} = ${objectAccessor(state, parentId, item, getAccessor, nameNode)};`);
				} else {
					alias = state.getNewId();
					preStatements.push(`${alias} = ${objectAccessor(state, parentId, item, getAccessor, nameNode)};`);
					getBindingData(state, names, values, preStatements, postStatements, initializer, alias);
				}
			} else {
				alias = item.getName();
				preStatements.push(`${alias} = ${objectAccessor(state, parentId, item, getAccessor, nameNode)};`);
			}
		} else if (ts.TypeGuards.isOmittedExpression(item)) {
			getAccessor(state, parentId, childIndex, preStatements, idStack, true);
		} else {
			throw new CompilerError(
				`Unexpected ${item.getKindName()} in getBindingData.`,
				item,
				CompilerErrorType.UnexpectedBindingPattern,
				true,
			);
		}

		childIndex++;
	}
}
