import * as ts from "ts-morph";
import { checkReserved, transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { HasParameters } from "../types";

export function isBindingPattern(node: ts.Node) {
	return (
		node.getKind() === ts.SyntaxKind.ArrayBindingPattern || node.getKind() === ts.SyntaxKind.ObjectBindingPattern
	);
}

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

		if (child === undefined) {
			throw new TranspilerError(
				"Child missing from parameter!",
				param,
				TranspilerErrorType.ParameterChildMissing,
			);
		}

		let name: string;
		if (ts.TypeGuards.isIdentifier(child)) {
			name = transpileExpression(state, child);
			checkReserved(name, node);
		} else if (isBindingPattern(child)) {
			name = state.getNewId();
		} else {
			const kindName = child.getKindName();
			throw new TranspilerError(
				`Unexpected parameter type! (${kindName})`,
				param,
				TranspilerErrorType.UnexpectedParameterType,
			);
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

		if (isBindingPattern(child)) {
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
	bindingPatern: ts.Node,
	parentId: string,
) {
	const strKeys = bindingPatern.getKind() === ts.SyntaxKind.ObjectBindingPattern;
	const listItems = bindingPatern
		.getFirstChildByKindOrThrow(ts.SyntaxKind.SyntaxList)
		.getChildren()
		.filter(
			child =>
				child.getKind() === ts.SyntaxKind.BindingElement || child.getKind() === ts.SyntaxKind.OmittedExpression,
		);
	let childIndex = 1;
	for (const bindingElement of listItems) {
		if (bindingElement.getKind() === ts.SyntaxKind.BindingElement) {
			const [child, op, pattern] = bindingElement.getChildren();
			const childText = child.getText();
			const key = strKeys ? `"${childText}"` : childIndex;

			if (child.getKind() === ts.SyntaxKind.DotDotDotToken) {
				throw new TranspilerError(
					"Operator ... is not supported for destructuring!",
					child,
					TranspilerErrorType.SpreadDestructuring,
				);
			}

			if (pattern && isBindingPattern(pattern)) {
				const childId = state.getNewId();
				preStatements.push(`local ${childId} = ${parentId}[${key}];`);
				getBindingData(state, names, values, preStatements, postStatements, pattern, childId);
			} else if (child.getKind() === ts.SyntaxKind.ArrayBindingPattern) {
				const childId = state.getNewId();
				preStatements.push(`local ${childId} = ${parentId}[${key}];`);
				getBindingData(state, names, values, preStatements, postStatements, child, childId);
			} else if (child.getKind() === ts.SyntaxKind.Identifier) {
				let id: string;
				if (pattern && pattern.getKind() === ts.SyntaxKind.Identifier) {
					id = transpileExpression(state, pattern as ts.Expression);
				} else {
					id = transpileExpression(state, child as ts.Expression);
				}
				checkReserved(id, bindingPatern);
				names.push(id);
				if (op && op.getKind() === ts.SyntaxKind.EqualsToken) {
					const value = transpileExpression(state, pattern as ts.Expression);
					postStatements.push(`if ${id} == nil then ${id} = ${value} end;`);
				}
				values.push(`${parentId}[${key}]`);
			}
		}
		childIndex++;
	}
}
