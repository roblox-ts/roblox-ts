import * as ts from "ts-morph";
import {
	checkReserved,
	getParameterData,
	transpileBlock,
	transpileCallExpression,
	transpileExpression,
	transpileStatement,
} from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { HasParameters } from "../types";
import { isTupleType } from "../typeUtilities";

export function getFirstMemberWithParameters(nodes: Array<ts.Node<ts.ts.Node>>): HasParameters | undefined {
	for (const node of nodes) {
		if (
			ts.TypeGuards.isFunctionExpression(node) ||
			ts.TypeGuards.isArrowFunction(node) ||
			ts.TypeGuards.isFunctionDeclaration(node) ||
			ts.TypeGuards.isConstructorDeclaration(node) ||
			ts.TypeGuards.isMethodDeclaration(node) ||
			ts.TypeGuards.isGetAccessorDeclaration(node) ||
			ts.TypeGuards.isSetAccessorDeclaration(node)
		) {
			return node;
		}
	}
	return undefined;
}

function getReturnStrFromExpression(state: TranspilerState, exp: ts.Expression, func?: HasParameters) {
	if (func && isTupleType(func.getReturnType())) {
		if (ts.TypeGuards.isArrayLiteralExpression(exp)) {
			let expStr = transpileExpression(state, exp);
			expStr = expStr.substr(2, expStr.length - 4);
			return state.indent + `return ${expStr};`;
		} else if (ts.TypeGuards.isCallExpression(exp) && isTupleType(exp.getReturnType())) {
			const expStr = transpileCallExpression(state, exp, true);
			return state.indent + `return ${expStr};`;
		} else {
			const expStr = transpileExpression(state, exp);
			return state.indent + `return unpack(${expStr});`;
		}
	}
	return state.indent + `return ${transpileExpression(state, exp)};`;
}

export function transpileArguments(state: TranspilerState, args: Array<ts.Expression>, context?: ts.Expression) {
	return args.map(arg => transpileExpression(state, arg)).join(", ");
}

export function transpileReturnStatement(state: TranspilerState, node: ts.ReturnStatement) {
	const exp = node.getExpression();
	if (exp) {
		return getReturnStrFromExpression(state, exp, getFirstMemberWithParameters(node.getAncestors())) + "\n";
	} else {
		return state.indent + `return nil;\n`;
	}
}

export function transpileFunctionDeclaration(state: TranspilerState, node: ts.FunctionDeclaration) {
	let name = node.getName();
	if (name) {
		checkReserved(name, node);
	} else {
		name = state.getNewId();
	}
	state.pushExport(name, node);
	const body = node.getBody();
	if (!body) {
		return "";
	}
	state.hoistStack[state.hoistStack.length - 1].add(name);
	const paramNames = new Array<string>();
	const initializers = new Array<string>();
	state.pushIdStack();
	getParameterData(state, paramNames, initializers, node);
	const paramStr = paramNames.join(", ");
	let result = "";
	if (node.isAsync()) {
		result += state.indent + `${name} = TS.async(function(${paramStr})\n`;
	} else {
		result += state.indent + `${name} = function(${paramStr})\n`;
	}
	state.pushIndent();
	if (ts.TypeGuards.isBlock(body)) {
		initializers.forEach(initializer => (result += state.indent + initializer + "\n"));
		result += transpileBlock(state, body);
	}
	state.popIndent();
	state.popIdStack();
	if (node.isAsync()) {
		result += state.indent + "end);\n";
	} else {
		result += state.indent + "end;\n";
	}
	return result;
}

export function transpileMethodDeclaration(state: TranspilerState, node: ts.MethodDeclaration) {
	const name = node.getName();
	checkReserved(name, node);
	const body = node.getBodyOrThrow();

	const paramNames = new Array<string>();
	paramNames.push("self");
	const initializers = new Array<string>();
	state.pushIdStack();
	getParameterData(state, paramNames, initializers, node);
	const paramStr = paramNames.join(", ");

	let result = "";
	if (node.isAsync()) {
		result += `${name} = TS.async(function(${paramStr})\n`;
	} else {
		result += `${name} = function(${paramStr})\n`;
	}
	state.pushIndent();
	if (ts.TypeGuards.isBlock(body)) {
		initializers.forEach(initializer => (result += state.indent + initializer + "\n"));
		result += transpileBlock(state, body);
	}
	state.popIndent();
	state.popIdStack();
	result += state.indent + "end" + (node.isAsync() ? ")" : "") + ";\n";
	return result;
}

function containsSuperExpression(child?: ts.Statement<ts.ts.Statement>) {
	if (child && ts.TypeGuards.isExpressionStatement(child)) {
		const exp = child.getExpression();
		if (ts.TypeGuards.isCallExpression(exp)) {
			const superExp = exp.getExpression();
			if (ts.TypeGuards.isSuperExpression(superExp)) {
				return true;
			}
		}
	}
	return false;
}

export function transpileConstructorDeclaration(
	state: TranspilerState,
	className: string,
	node?: ts.ConstructorDeclaration,
	extraInitializers?: Array<string>,
	hasInstanceInheritance?: boolean,
) {
	const paramNames = new Array<string>();
	paramNames.push("self");
	const initializers = new Array<string>();
	const defaults = new Array<string>();

	state.pushIdStack();
	if (node) {
		getParameterData(state, paramNames, initializers, node, defaults);
	} else {
		paramNames.push("...");
	}
	const paramStr = paramNames.join(", ");

	let result = "";
	result += state.indent + `${className}.constructor = function(${paramStr})\n`;
	state.pushIndent();

	if (node) {
		const body = node.getBodyOrThrow();
		if (ts.TypeGuards.isBlock(body)) {
			defaults.forEach(initializer => (result += state.indent + initializer + "\n"));

			const bodyStatements = body.getStatements();
			let k = 0;

			if (containsSuperExpression(bodyStatements[k])) {
				result += transpileStatement(state, bodyStatements[k++]);
			}

			initializers.forEach(initializer => (result += state.indent + initializer + "\n"));

			if (extraInitializers) {
				extraInitializers.forEach(initializer => (result += state.indent + initializer));
			}

			for (; k < bodyStatements.length; ++k) {
				result += transpileStatement(state, bodyStatements[k]);
			}

			const returnStatement = node.getStatementByKind(ts.SyntaxKind.ReturnStatement);

			if (returnStatement) {
				throw new TranspilerError(
					`Cannot use return statement in constructor for ${className}`,
					returnStatement,
					TranspilerErrorType.NoConstructorReturn,
				);
			}
		}
	} else {
		if (hasInstanceInheritance) {
			result += state.indent + `super.constructor(self, ...);\n`;
		}
		if (extraInitializers) {
			extraInitializers.forEach(initializer => (result += state.indent + initializer));
		}
	}
	result += state.indent + "return self;\n";
	state.popIndent();
	state.popIdStack();
	result += state.indent + "end;\n";
	return result;
}

export function transpileAccessorDeclaration(
	state: TranspilerState,
	node: ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
	name: string,
) {
	const body = node.getBody();
	if (!body) {
		return "";
	}
	const paramNames = new Array<string>();
	paramNames.push("self");
	const initializers = new Array<string>();
	state.pushIdStack();
	getParameterData(state, paramNames, initializers, node);
	const paramStr = paramNames.join(", ");
	let result = "";
	result += state.indent + `${name} = function(${paramStr})\n`;
	state.pushIndent();
	if (ts.TypeGuards.isBlock(body)) {
		initializers.forEach(initializer => (result += state.indent + initializer + "\n"));
		result += transpileBlock(state, body);
	}
	state.popIndent();
	state.popIdStack();
	result += state.indent + "end;\n";
	return result;
}

export function transpileFunctionExpression(state: TranspilerState, node: ts.FunctionExpression | ts.ArrowFunction) {
	const body = node.getBody();
	const paramNames = new Array<string>();
	const initializers = new Array<string>();
	state.pushIdStack();
	getParameterData(state, paramNames, initializers, node);
	const paramStr = paramNames.join(", ");
	let result = "";
	result += `function(${paramStr})`;
	if (ts.TypeGuards.isBlock(body)) {
		result += "\n";
		state.pushIndent();
		initializers.forEach(initializer => (result += state.indent + initializer + "\n"));
		result += transpileBlock(state, body);
		state.popIndent();
		result += state.indent + "end";
	} else if (ts.TypeGuards.isExpression(body)) {
		if (initializers.length > 0) {
			result += " ";
		}
		initializers.push(getReturnStrFromExpression(state, body, node));
		const initializersStr = initializers.join(" ");
		result += ` ${initializersStr} end`;
	} else {
		const bodyKindName = body.getKindName();
		throw new TranspilerError(`Bad function body (${bodyKindName})`, node, TranspilerErrorType.BadFunctionBody);
	}
	if (node.isAsync()) {
		result = `TS.async(${result})`;
	}
	state.popIdStack();
	return result;
}
