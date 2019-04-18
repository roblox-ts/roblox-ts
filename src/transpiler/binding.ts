import * as ts from "ts-morph";
import { transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { HasParameters } from "../types";
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
			const namesStr = names.join(", ");
			const valuesStr = values.join(", ");
			initializers.push(`local ${namesStr} = ${valuesStr};`);
			postStatements.forEach(statement => initializers.push(statement));
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
	const strKeys = bindingPattern.getKind() === ts.SyntaxKind.ObjectBindingPattern;
	const listItems = bindingPattern
		.getFirstChildByKindOrThrow(ts.SyntaxKind.SyntaxList)
		.getChildren()
		.filter(
			child =>
				ts.TypeGuards.isBindingElement(child) ||
				ts.TypeGuards.isOmittedExpression(child) ||
				ts.TypeGuards.isIdentifier(child) ||
				ts.TypeGuards.isArrayLiteralExpression(child) ||
				ts.TypeGuards.isPropertyAccessExpression(child),
		);
	let childIndex = 1;
	for (const item of listItems) {
		/* istanbul ignore else */
		if (ts.TypeGuards.isBindingElement(item)) {
			const [child, op, pattern] = item.getChildren();
			const childText = child.getText();
			const key = strKeys ? `"${childText}"` : childIndex;

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
				preStatements.push(`local ${childId} = ${parentId}[${key}];`);
				getBindingData(state, names, values, preStatements, postStatements, pattern, childId);
			} else if (ts.TypeGuards.isArrayBindingPattern(child)) {
				const childId = state.getNewId();
				preStatements.push(`local ${childId} = ${parentId}[${key}];`);
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
				values.push(`${parentId}[${key}]`);
			}
		} else if (ts.TypeGuards.isIdentifier(item)) {
			const id = transpileExpression(state, item as ts.Expression);
			names.push(id);
			values.push(`${parentId}[${childIndex}]`);
		} else if (ts.TypeGuards.isPropertyAccessExpression(item)) {
			const id = transpileExpression(state, item as ts.Expression);
			names.push(id);
			values.push(`${parentId}[${childIndex}]`);
		} else if (ts.TypeGuards.isArrayLiteralExpression(item)) {
			const childId = state.getNewId();
			preStatements.push(`local ${childId} = ${parentId}[${childIndex}];`);
			getBindingData(state, names, values, preStatements, postStatements, item, childId);
		}
		childIndex++;
	}
}
