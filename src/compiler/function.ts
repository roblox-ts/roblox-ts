import * as ts from "ts-morph";
import {
	checkReserved,
	checkReturnsNonAny,
	compileBlock,
	compileCallExpression,
	compileExpression,
	compileStatement,
	getParameterData,
} from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { skipNodesDownwards, skipNodesUpwards } from "../utility/general";
import { classDeclarationInheritsFromArray, getType, isGeneratorType, isTupleType, shouldHoist } from "../utility/type";
import { isDefinedAsMethod } from "./call";
import { isValidLuaIdentifier } from "./security";

export type HasParameters =
	| ts.FunctionExpression
	| ts.ArrowFunction
	| ts.FunctionDeclaration
	| ts.ConstructorDeclaration
	| ts.MethodDeclaration;

export const nodeHasParameters = (ancestor: ts.Node): ancestor is HasParameters =>
	ts.TypeGuards.isFunctionExpression(ancestor) ||
	ts.TypeGuards.isArrowFunction(ancestor) ||
	ts.TypeGuards.isFunctionDeclaration(ancestor) ||
	ts.TypeGuards.isConstructorDeclaration(ancestor) ||
	ts.TypeGuards.isMethodDeclaration(ancestor);

function getReturnStrFromExpression(state: CompilerState, exp: ts.Expression, func?: HasParameters) {
	exp = skipNodesDownwards(exp);

	if (func && isTupleType(func.getReturnType())) {
		if (ts.TypeGuards.isArrayLiteralExpression(exp)) {
			let expStr = compileExpression(state, exp);
			expStr = expStr.substr(2, expStr.length - 4);
			return `return ${expStr};`;
		} else if (ts.TypeGuards.isCallExpression(exp) && isTupleType(exp.getReturnType())) {
			const expStr = compileCallExpression(state, exp, true);
			return `return ${expStr};`;
		} else {
			const expStr = compileExpression(state, exp);
			return `return unpack(${expStr});`;
		}
	}
	{
		state.declarationContext.set(exp, {
			isIdentifier: false,
			set: "return",
		});
		const expStr = compileExpression(state, exp);
		return state.declarationContext.delete(exp) && `return ${expStr};`;
	}
}

export function compileReturnStatement(state: CompilerState, node: ts.ReturnStatement) {
	const exp = skipNodesDownwards(node.getExpression());
	if (exp) {
		state.enterPrecedingStatementContext();
		const funcNode = node.getFirstAncestor(nodeHasParameters);
		const returnStr = getReturnStrFromExpression(state, exp, funcNode);
		return state.exitPrecedingStatementContextAndJoin() + (returnStr ? state.indent + returnStr + "\n" : "");
	} else {
		return state.indent + `return nil;\n`;
	}
}

export function isFunctionExpressionMethod(node: ts.FunctionExpression) {
	const parent = skipNodesUpwards(node.getParent());
	return ts.TypeGuards.isPropertyAssignment(parent) && ts.TypeGuards.isObjectLiteralExpression(parent.getParent());
}

export function isMethodDeclaration(node: ts.Node<ts.ts.Node>): node is ts.MethodDeclaration | ts.FunctionExpression {
	if (ts.TypeGuards.isParameteredNode(node)) {
		const thisParam = node.getParameter("this");
		if (thisParam) {
			return getType(thisParam).getText() !== "void";
		} else {
			return (
				ts.TypeGuards.isMethodDeclaration(node) ||
				ts.TypeGuards.isMethodSignature(node) ||
				(ts.TypeGuards.isFunctionExpression(node) && isFunctionExpressionMethod(node))
			);
		}
	}

	return false;
}

function compileFunctionBody(state: CompilerState, body: ts.Node, node: HasParameters, initializers: Array<string>) {
	const isBlock = ts.TypeGuards.isBlock(body);
	const isExpression = ts.TypeGuards.isExpression(body);
	let result = "";
	if (isBlock || isExpression) {
		result += "\n";
		state.pushIndent();
		initializers.forEach(initializer => (result += state.indent + initializer + "\n"));
		if (isBlock) {
			result += compileBlock(state, body as ts.Block);
		} else {
			state.enterPrecedingStatementContext();
			const returnStr = getReturnStrFromExpression(state, body as ts.Expression, node);
			result += state.exitPrecedingStatementContextAndJoin() + (returnStr ? state.indent + returnStr + "\n" : "");
		}
		state.popIndent();
		result += state.indent;
	} else {
		/* istanbul ignore next */
		throw new CompilerError(
			`Unexpected function body ( ${body.getKindName()} ) in compileFunctionBody`,
			node,
			CompilerErrorType.BadFunctionBody,
			true,
		);
	}
	return result;
}

function canSugaryCompileFunction(node: HasParameters) {
	if (node.getSourceFile().getExtension() === "tsx") {
		return false;
	} else if (ts.TypeGuards.isConstructorDeclaration(node)) {
		return true;
	} else if (ts.TypeGuards.isFunctionDeclaration(node) || ts.TypeGuards.isMethodDeclaration(node)) {
		const nameNode = node.getNameNode();
		if (nameNode && ts.TypeGuards.isIdentifier(nameNode) && isValidLuaIdentifier(node.getName()!)) {
			return true;
		}
	}
	return false;
}

function compileFunction(
	state: CompilerState,
	node: HasParameters,
	name: string,
	body: ts.Node<ts.ts.Node>,
	namePrefix = "",
) {
	isDefinedAsMethod(node);
	state.pushIdStack();
	const paramNames = new Array<string>();
	const initializers = new Array<string>();

	getParameterData(state, paramNames, initializers, node);
	checkReturnsNonAny(node);

	const results = new Array<string>();
	let frontWrap = "";
	let backWrap = "";
	let declarationPrefix = "";

	if (ts.TypeGuards.isFunctionDeclaration(node)) {
		const nameNode = node.getNameNode();
		if (nameNode && shouldHoist(node, nameNode)) {
			state.pushHoistStack(name);
		} else {
			declarationPrefix = "local ";
		}
	}

	let isGenerator = false;

	if (!ts.TypeGuards.isConstructorDeclaration(node)) {
		/* istanbul ignore next */
		if (node.isAsync()) {
			state.usesTSLibrary = true;
			frontWrap += "TS.async(";
			backWrap += ")" + backWrap;
		}
		isGenerator = !ts.TypeGuards.isArrowFunction(node) && node.isGenerator();
	}

	const isMethod = isMethodDeclaration(node);

	if (name) {
		results.push(state.indent, declarationPrefix);
		if (frontWrap === "" && canSugaryCompileFunction(node)) {
			results.push("function ");
			if (namePrefix) {
				results.push(namePrefix, isMethod ? ":" : ".");
			} else if (isMethod) {
				paramNames.unshift("self");
			}
			results.push(name);
		} else {
			if (namePrefix) {
				results.push(namePrefix);
				if (!name.startsWith("[")) {
					results.push(".");
				}
			}
			results.push(name, " = ", frontWrap, "function");
			if (isMethod) {
				paramNames.unshift("self");
			}
		}
		backWrap += ";\n";
	} else {
		results.push(frontWrap, "function");
		if (isMethod) {
			paramNames.unshift("self");
		}
	}

	results.push("(", paramNames.join(", "), ")");

	if (isGenerator) {
		// will error if IterableIterator is nullable
		isGeneratorType(node.getReturnType());
		results.push("\n");
		state.pushIndent();
		results.push(state.indent, `return {\n`);
		state.pushIndent();
		state.usesTSLibrary = true;
		results.push(state.indent, `[TS.Symbol_iterator] = function(self) return self; end;\n`);
		results.push(state.indent, `next = coroutine.wrap(function()`);
		results.push(compileFunctionBody(state, body, node, initializers));
		results.push(`\twhile true do coroutine.yield({ done = true }) end;\n`);
		results.push(state.indent, `end);\n`);
		state.popIndent();
		results.push(state.indent, `};\n`);
		state.popIndent();
		results.push(state.indent);
	} else {
		results.push(compileFunctionBody(state, body, node, initializers));
	}
	state.popIdStack();
	results.push("end", backWrap);
	return results.join("");
}

export function compileFunctionDeclaration(state: CompilerState, node: ts.FunctionDeclaration) {
	const body = node.getBody();

	if (body) {
		const nameNode = node.getNameNode();
		const name = nameNode ? checkReserved(nameNode) : state.getNewId();
		state.pushExport(name, node);
		return compileFunction(state, node, name, body);
	} else {
		return "";
	}
}

export function compileMethodDeclaration(state: CompilerState, node: ts.MethodDeclaration, namePrefix: string) {
	const nameNode = node.getNameNode();
	let name: string;

	if (ts.TypeGuards.isComputedPropertyName(nameNode)) {
		name = `[${compileExpression(state, skipNodesDownwards(nameNode.getExpression()))}]`;
	} else {
		name = compileExpression(state, nameNode);
		if (!isValidLuaIdentifier(name)) {
			name = `["${name}"]`;
		}
	}

	return compileFunction(state, node, name, node.getBodyOrThrow(), namePrefix);
}

function containsSuperExpression(child?: ts.Statement<ts.ts.Statement>) {
	if (child && ts.TypeGuards.isExpressionStatement(child)) {
		const exp = skipNodesDownwards(child.getExpression());
		if (ts.TypeGuards.isCallExpression(exp)) {
			const superExp = skipNodesDownwards(exp.getExpression());
			if (ts.TypeGuards.isSuperExpression(superExp)) {
				return true;
			}
		}
	}
	return false;
}

export function compileConstructorDeclaration(
	state: CompilerState,
	classExp: ts.ClassDeclaration | ts.ClassExpression,
	className: string,
	node: ts.ConstructorDeclaration | undefined,
	extraInitializers: Array<string>,
	hasSuper: boolean,
	isRoact: boolean,
) {
	if (isRoact && !node) {
		return "";
	}

	const paramNames = new Array<string>();
	const initializers = new Array<string>();
	const defaults = new Array<string>();
	const inheritsFromArray = classDeclarationInheritsFromArray(classExp, false);

	state.pushIdStack();
	if (node) {
		getParameterData(state, paramNames, initializers, node, defaults);
	} else if (!inheritsFromArray) {
		paramNames.push("...");
	}
	const paramStr = paramNames.join(", ");

	const methodName = isRoact ? "init" : "constructor";

	let result = "";
	state.hoistStack.push(new Set<string>());
	state.pushIndent();

	if (node) {
		const body = node.getBodyOrThrow();
		if (ts.TypeGuards.isBlock(body)) {
			defaults.forEach(initializer => (result += state.indent + initializer + "\n"));

			const bodyStatements = body.getStatements();
			let k = 0;

			if (containsSuperExpression(bodyStatements[k])) {
				result += compileStatement(state, bodyStatements[k++]);
			}

			initializers.forEach(initializer => (result += state.indent + initializer + "\n"));

			if (extraInitializers) {
				extraInitializers.forEach(initializer => (result += initializer));
			}

			for (; k < bodyStatements.length; ++k) {
				result += compileStatement(state, bodyStatements[k]);
			}

			const returnStatement = node.getStatementByKind(ts.SyntaxKind.ReturnStatement);

			if (returnStatement) {
				throw new CompilerError(
					`Cannot use return statement in constructor for ${className}`,
					returnStatement,
					CompilerErrorType.NoConstructorReturn,
				);
			}
		}
	} else {
		if (hasSuper && !inheritsFromArray) {
			result += state.indent + `super.constructor(self, ...);\n`;
		}
		if (extraInitializers) {
			extraInitializers.forEach(initializer => (result += initializer));
		}
	}
	result = state.popHoistStack(result);
	state.popIndent();
	state.popIdStack();
	return state.indent + `function ${className}:${methodName}(${paramStr})\n` + result + state.indent + "end;\n";
}

export function compileFunctionExpression(state: CompilerState, node: ts.FunctionExpression | ts.ArrowFunction) {
	const potentialNameNode = node.getChildAtIndex(1);

	if (
		ts.TypeGuards.isFunctionExpression(node) &&
		ts.TypeGuards.isIdentifier(potentialNameNode) &&
		potentialNameNode.findReferences()[0].getReferences().length > 1
	) {
		const name = compileExpression(state, potentialNameNode);
		checkReserved(potentialNameNode);
		const id = state.pushPrecedingStatementToNewId(node, "");
		state.pushPrecedingStatements(node, state.indent + `do\n`);
		state.pushIndent();
		state.pushPrecedingStatements(node, state.indent + `local ${name};\n`);
		state.pushPrecedingStatements(node, compileFunction(state, node, `${name}`, node.getBody()));
		state.pushPrecedingStatements(node, state.indent + `${id} = ${name};\n`);
		state.popIndent();
		state.pushPrecedingStatements(node, state.indent + `end;\n`);
		// this should not be classified as isPushed.
		return id;
	} else {
		return compileFunction(state, node, "", node.getBody());
	}
}
