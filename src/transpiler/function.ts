import * as ts from "ts-morph";
import {
	checkReserved,
	checkReturnsNonAny,
	getParameterData,
	transpileBlock,
	transpileCallExpression,
	transpileExpression,
	transpileStatement,
} from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { HasParameters } from "../types";
import { isTupleType, shouldHoist } from "../typeUtilities";

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
			return `return ${expStr};`;
		} else if (ts.TypeGuards.isCallExpression(exp) && isTupleType(exp.getReturnType())) {
			const expStr = transpileCallExpression(state, exp, true);
			return `return ${expStr};`;
		} else {
			const expStr = transpileExpression(state, exp);
			return `return unpack(${expStr});`;
		}
	}
	return `return ${transpileExpression(state, exp)};`;
}

export function transpileReturnStatement(state: TranspilerState, node: ts.ReturnStatement) {
	const exp = node.getExpression();
	if (exp) {
		return (
			state.indent +
			getReturnStrFromExpression(state, exp, getFirstMemberWithParameters(node.getAncestors())) +
			"\n"
		);
	} else {
		return state.indent + `return nil;\n`;
	}
}

function transpileFunctionBody(
	state: TranspilerState,
	body: ts.Node,
	node: HasParameters,
	initializers: Array<string>,
) {
	const isBlock = ts.TypeGuards.isBlock(body);
	const isExpression = ts.TypeGuards.isExpression(body);
	let result = "";
	if (isBlock || isExpression) {
		result += "\n";
		state.pushIndent();
		initializers.forEach(initializer => (result += state.indent + initializer + "\n"));
		if (isBlock) {
			result += transpileBlock(state, body as ts.Block);
		} else {
			result += state.indent + getReturnStrFromExpression(state, body as ts.Expression, node) + "\n";
		}
		state.popIndent();
		result += state.indent;
	} else {
		/* istanbul ignore next */
		throw new TranspilerError(
			`Bad function body (${body.getKindName()})`,
			node,
			TranspilerErrorType.BadFunctionBody,
		);
	}
	return result;
}

function transpileFunction(state: TranspilerState, node: HasParameters, name: string, body: ts.Node<ts.ts.Node>) {
	state.pushIdStack();
	const paramNames = new Array<string>();
	const initializers = new Array<string>();

	getParameterData(state, paramNames, initializers, node);

	checkReturnsNonAny(node);

	if (
		ts.TypeGuards.isMethodDeclaration(node) ||
		ts.TypeGuards.isGetAccessorDeclaration(node) ||
		ts.TypeGuards.isSetAccessorDeclaration(node)
	) {
		giveInitialSelfParameter(node, paramNames);
	}

	let result: string;
	let backWrap = "";

	let prefix = "";
	if (ts.TypeGuards.isFunctionDeclaration(node)) {
		const nameNode = node.getNameNode();
		if (nameNode && shouldHoist(node, nameNode)) {
			state.pushHoistStack(name);
		} else {
			prefix = "local ";
		}
	}

	if (name) {
		result = state.indent + prefix + name + " = ";
		backWrap = ";\n";
	} else {
		result = "";
	}

	if (
		!ts.TypeGuards.isGetAccessorDeclaration(node) &&
		!ts.TypeGuards.isSetAccessorDeclaration(node) &&
		!ts.TypeGuards.isConstructorDeclaration(node) &&
		node.isAsync()
	) {
		state.usesTSLibrary = true;
		result += "TS.async(";
		backWrap = ")" + backWrap;
	}

	result += "function(" + paramNames.join(", ") + ")";
	result += transpileFunctionBody(state, body, node, initializers);
	state.popIdStack();
	return result + "end" + backWrap;
}

function giveInitialSelfParameter(
	node: ts.MethodDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
	paramNames: Array<string>,
) {
	const parameters = node.getParameters();
	let replacedThis = false;

	if (parameters.length > 0) {
		const child = parameters[0].getFirstChildByKind(ts.SyntaxKind.Identifier);
		const classParent =
			node.getFirstAncestorByKind(ts.SyntaxKind.ClassDeclaration) ||
			node.getFirstAncestorByKind(ts.SyntaxKind.ClassExpression);
		if (
			classParent &&
			child &&
			child.getText() === "this" &&
			(child.getType().getText() === "this" || child.getType() === classParent.getType())
		) {
			paramNames[0] = "self";
			replacedThis = true;
		}
	}

	if (!replacedThis) {
		const thisParam = node.getParameter("this");
		if (!thisParam || thisParam.getType().getText() !== "void") {
			paramNames.unshift("self");
		}
	}
}

export function transpileFunctionDeclaration(state: TranspilerState, node: ts.FunctionDeclaration) {
	const body = node.getBody();
	let name = node.getName();

	if (name) {
		checkReserved(name, node, true);
	} else {
		name = state.getNewId();
	}

	if (body) {
		state.pushExport(name, node);
		return transpileFunction(state, node, name, body);
	} else {
		return "";
	}
}

export function transpileMethodDeclaration(state: TranspilerState, node: ts.MethodDeclaration) {
	const name = node.getName();
	checkReserved(name, node);
	return transpileFunction(state, node, name, node.getBodyOrThrow());
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
	hasSuper?: boolean,
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
		if (hasSuper) {
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
	return transpileFunction(state, node, name, body);
}

export function transpileFunctionExpression(state: TranspilerState, node: ts.FunctionExpression | ts.ArrowFunction) {
	return transpileFunction(state, node, "", node.getBody());
}
