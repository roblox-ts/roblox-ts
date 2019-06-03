import * as ts from "ts-morph";
import { compileExpression, compileIdentifier } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { HasParameters } from "../types";
import {
	isArrayMethodType,
	isArrayType,
	isIterableFunction,
	isIterableIterator,
	isMapMethodType,
	isMapType,
	isObjectType,
	isSetMethodType,
	isSetType,
	isStringType,
} from "../typeUtilities";
import { getNonNullUnParenthesizedExpressionDownwards, joinIndentedLines } from "../utility";
import { getComputedPropertyAccess, isIdentifierDefinedInExportLet } from "./indexed";

function compileParamDefault(state: CompilerState, initial: ts.Expression, name: string) {
	state.enterPrecedingStatementContext();
	const initialToWriteTo = getNonNullUnParenthesizedExpressionDownwards(initial);

	state.declarationContext.set(initialToWriteTo, {
		isIdentifier: ts.TypeGuards.isIdentifier(initial) && !isIdentifierDefinedInExportLet(initial),
		set: name,
	});
	const expStr = compileExpression(state, initial);
	const context = state.exitPrecedingStatementContext();

	let defaultValue: string;
	if (context.length > 0) {
		state.pushIndent();
		defaultValue =
			`if ${name} == nil then\n` +
			joinIndentedLines(context, 2) +
			state.indent +
			`${state.declarationContext.delete(initialToWriteTo) ? `\t${name} = ${expStr};\n` + state.indent : ""}` +
			`end;`;
		state.popIndent();
	} else {
		defaultValue = `if ${name} == nil then${
			state.declarationContext.delete(initialToWriteTo) ? ` ${name} = ${expStr};` : ""
		} end;`;
	}
	return defaultValue;
}

export function getParameterData(
	state: CompilerState,
	paramNames: Array<string>,
	initializers: Array<string>,
	node: HasParameters,
	defaults?: Array<string>,
) {
	for (const param of node.getParameters()) {
		const child =
			param.getFirstChildByKind(ts.SyntaxKind.Identifier) ||
			param.getFirstChildByKind(ts.SyntaxKind.ArrayBindingPattern) ||
			param.getFirstChildByKind(ts.SyntaxKind.ObjectBindingPattern);

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
		} else {
			name = state.getNewId();
		}

		if (param.isRestParameter()) {
			paramNames.push("...");
			initializers.push(`local ${name} = { ... };`);
		} else {
			paramNames.push(name);
		}

		const initial = param.getInitializer();
		if (initial) {
			(defaults ? defaults : initializers).push(compileParamDefault(state, initial, name));
		}

		if (param.hasScopeKeyword() || param.isReadonly()) {
			initializers.push(`self.${name} = ${name};`);
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

	if (ts.TypeGuards.isIdentifier(nameNode)) {
		name = compileExpression(state, nameNode);
	} else if (ts.TypeGuards.isComputedPropertyName(nameNode)) {
		const exp = nameNode.getExpression();

		name = getComputedPropertyAccess(
			state,
			exp,
			aliasNode.getFirstAncestorByKindOrThrow(ts.SyntaxKind.ObjectLiteralExpression).getParent(),
		);

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
		const type = aliasNode.getType();
		if (isArrayMethodType(type) || isMapMethodType(type) || isSetMethodType(type)) {
			throw new CompilerError(
				`Cannot index method ${name} (a roblox-ts internal)`,
				aliasNode,
				CompilerErrorType.BadDestructuringType,
			);
		}
	}

	return `${t}.${name}`;
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
	const bindingPatternType = bindingPattern.getType();
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
		ts.TypeGuards.isThisExpression(bindingPattern)
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
				const id: string = compileIdentifier(state, idNode, true);
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
				const expStr = getComputedPropertyAccess(state, child.getExpression(), bindingPattern);
				const accessor = `${parentId}[${expStr}]`;
				const childId: string = compileExpression(state, pattern as ts.Expression);
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
				const initializer = item.getInitializer()!;
				if (ts.TypeGuards.isIdentifier(initializer)) {
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
