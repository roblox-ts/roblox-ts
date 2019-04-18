import * as ts from "ts-morph";
import { transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { HasParameters } from "../types";
import { isArrayType, isMapType, isSetType, isStringType } from "../typeUtilities";
import { transpileIdentifier } from "./identifier";

export function getParameterData(
	state: TranspilerState,
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
			throw new TranspilerError(
				"Child missing from parameter!",
				param,
				TranspilerErrorType.ParameterChildMissing,
			);
		}

		let name: string;
		if (ts.TypeGuards.isIdentifier(child)) {
			if (param.getName() === "this") {
				continue;
			}
			name = transpileExpression(state, child);
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
			const expStr = transpileExpression(state, initial);
			const defaultValue = `if ${name} == nil then ${name} = ${expStr} end;`;
			if (defaults) {
				defaults.push(defaultValue);
			} else {
				initializers.push(defaultValue);
			}
		}

		if (param.hasScopeKeyword()) {
			initializers.push(`self.${name} = ${name};`);
		}

		if (ts.TypeGuards.isArrayBindingPattern(child) || ts.TypeGuards.isObjectBindingPattern(child)) {
			const names = new Array<string>();
			const values = new Array<string>();
			const preStatements = new Array<string>();
			const postStatements = new Array<string>();
			getBindingData(state, names, values, preStatements, postStatements, child, name);
			preStatements.forEach(statement => initializers.push(statement));
			initializers.push(`local ${names.join(", ")} = ${values.join(", ")};`);
			postStatements.forEach(statement => initializers.push(statement));
		}
	}
}

function arrayAccessor(t: string, key: number) {
	return `${t}[${key}]`;
}

function objectAccessor(t: string, node: ts.Node, getAccessor: (t: string, key: number) => string) {
	const key = node.getText();
	if (getAccessor) {
		if (key === "length") {
			return `#${t}`;
		} else {
			throw new TranspilerError(
				`Cannot index method ${key} (a roblox-ts internal)`,
				node,
				TranspilerErrorType.BadDestructuringType,
			);
		}
	}
	return `${t}.${key}`;
}

function stringAccessor(t: string, key: number) {
	return `${t}:sub(${key}, ${key})`;
}

function setAccessor(t: string, key: number) {
	return "(" + `next(${t}, `.repeat(key).slice(0, -2) + ")".repeat(key + 1);
}

function mapAccessor(t: string, key: number) {
	return "({ " + `next(${t}, `.repeat(key).slice(0, -2) + ")".repeat(key) + " })";
}

function getAccessorForBindingPatternType(bindingPattern: ts.Node, isObject: boolean) {
	const bindingPatternType = bindingPattern.getType();
	if (isArrayType(bindingPatternType)) {
		return arrayAccessor;
	} else if (isStringType(bindingPatternType)) {
		return stringAccessor;
	} else if (isSetType(bindingPatternType)) {
		return setAccessor;
	} else if (isMapType(bindingPatternType)) {
		return mapAccessor;
	} else {
		if (isObject) {
			return null as never;
		} else {
			throw new TranspilerError(
				`Cannot destructure an object of type ${bindingPatternType.getText()}`,
				bindingPattern,
				TranspilerErrorType.BadDestructuringType,
			);
		}
	}
}

export function getBindingData(
	state: TranspilerState,
	names: Array<string>,
	values: Array<string>,
	preStatements: Array<string>,
	postStatements: Array<string>,
	bindingPattern: ts.Node,
	parentId: string,
) {
	console.log(bindingPattern.getType().getText());
	const strKeys = bindingPattern.getKind() === ts.SyntaxKind.ObjectBindingPattern;
	const getAccessor = getAccessorForBindingPatternType(bindingPattern, strKeys);

	const listItems = bindingPattern.getFirstChildByKindOrThrow(ts.SyntaxKind.SyntaxList).getChildren();
	let childIndex = 1;

	for (const item of listItems) {
		/* istanbul ignore else */
		if (ts.TypeGuards.isBindingElement(item)) {
			const [child, op, pattern] = item.getChildren();

			if (child.getKind() === ts.SyntaxKind.DotDotDotToken) {
				throw new TranspilerError(
					"Operator ... is not supported for destructuring!",
					child,
					TranspilerErrorType.SpreadDestructuring,
				);
			}

			/* istanbul ignore else */
			if (
				pattern &&
				(ts.TypeGuards.isArrayBindingPattern(pattern) || ts.TypeGuards.isObjectBindingPattern(pattern))
			) {
				const childId = state.getNewId();
				const accessor: string = strKeys
					? objectAccessor(parentId, child, getAccessor)
					: getAccessor(parentId, childIndex);
				preStatements.push(`local ${childId} = ${accessor};`);
				getBindingData(state, names, values, preStatements, postStatements, pattern, childId);
			} else if (ts.TypeGuards.isArrayBindingPattern(child)) {
				const childId = state.getNewId();
				const accessor: string = strKeys
					? objectAccessor(parentId, child, getAccessor)
					: getAccessor(parentId, childIndex);
				preStatements.push(`local ${childId} = ${accessor};`);
				getBindingData(state, names, values, preStatements, postStatements, child, childId);
			} else if (ts.TypeGuards.isIdentifier(child)) {
				const id: string = transpileIdentifier(
					state,
					pattern && ts.TypeGuards.isIdentifier(pattern) ? pattern : child,
					true,
				);
				names.push(id);
				if (op && op.getKind() === ts.SyntaxKind.EqualsToken) {
					const value = transpileExpression(state, pattern as ts.Expression);
					postStatements.push(`if ${id} == nil then ${id} = ${value} end;`);
				}
				const accessor: string = strKeys
					? objectAccessor(parentId, child, getAccessor)
					: getAccessor(parentId, childIndex);
				values.push(accessor);
			} else if (ts.TypeGuards.isObjectBindingPattern(child)) {
				const childId = state.getNewId();
				const accessor: string = strKeys
					? objectAccessor(parentId, child, getAccessor)
					: getAccessor(parentId, childIndex);
				preStatements.push(`local ${childId} = ${accessor};`);
				getBindingData(state, names, values, preStatements, postStatements, child, childId);
			} else {
				throw new TranspilerError(
					`Roblox-TS doesn't know what to do with ${child.getKindName()}. ` +
						`Please report this at https://github.com/roblox-ts/roblox-ts/issues`,
					child,
					TranspilerErrorType.UnexpectedBindingPattern,
				);
			}
		} else if (ts.TypeGuards.isIdentifier(item)) {
			const id = transpileExpression(state, item as ts.Expression);
			names.push(id);
			values.push(getAccessor(parentId, childIndex));
		} else if (ts.TypeGuards.isPropertyAccessExpression(item)) {
			const id = transpileExpression(state, item as ts.Expression);
			names.push(id);
			values.push(getAccessor(parentId, childIndex));
		} else if (ts.TypeGuards.isArrayLiteralExpression(item)) {
			const childId = state.getNewId();
			preStatements.push(`local ${childId} = ${getAccessor(parentId, childIndex)};`);
			getBindingData(state, names, values, preStatements, postStatements, item, childId);
		} else if (item.getKind() !== ts.SyntaxKind.CommaToken) {
			childIndex--;
		} else {
			throw new TranspilerError(
				`Roblox-TS doesn't know what to do with ${item.getKindName()}. ` +
					`Please report this at https://github.com/roblox-ts/roblox-ts/issues`,
				item,
				TranspilerErrorType.UnexpectedBindingPattern,
			);
		}

		childIndex++;
	}
}
