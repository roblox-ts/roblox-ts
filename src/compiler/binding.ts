import * as ts from "ts-morph";
import {
	checkPropertyCollision,
	compileExpression,
	CompilerDirective,
	getComputedPropertyAccess,
	HasParameters,
	isIdentifierDefinedInExportLet,
} from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
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

type BindingPattern = ts.ArrayBindingPattern | ts.ObjectBindingPattern;
type BindingLiteral = ts.ArrayLiteralExpression | ts.ObjectLiteralExpression;

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

	return [
		"if ",
		name,
		" == nil then",
		newline,
		contextLines,
		indentation,
		declaration ? tab + `${declaration}` + newline + indentation : "",
		"end;",
	].join("");
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
			checkReserved(child);
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
			initializers.push(...compileBindingPattern(state, child, name));
		}
	}
}

function arrayAccessor(state: CompilerState, node: ts.Node, t: string, key: number) {
	return `${t}[${key}]`;
}

function objectAccessor(
	state: CompilerState,
	t: string,
	node: ts.Node,
	getAccessor: (state: CompilerState, node: ts.Node, t: string, key: number, idStack: Array<string>) => string,
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

function stringAccessor(state: CompilerState, node: ts.Node, t: string, key: number) {
	return `string.sub(${t}, ${key}, ${key})`;
}

function setAccessor(state: CompilerState, node: ts.Node, t: string, key: number, idStack: Array<string>) {
	const id = state.getNewId();
	const lastId = idStack[idStack.length - 1] as string | undefined;
	if (lastId !== undefined) {
		state.pushPrecedingStatements(node, state.indent + `local ${id} = next(${t}, ${lastId});\n`);
	} else {
		state.pushPrecedingStatements(node, state.indent + `local ${id} = next(${t});\n`);
	}
	idStack.push(id);
	return id;
}

function mapAccessor(
	state: CompilerState,
	node: ts.Node,
	t: string,
	key: number,
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
		state.pushPrecedingStatements(node, state.indent + `local ${keyId}${valueIdStr} = next(${t}, ${lastId});\n`);
	} else {
		state.pushPrecedingStatements(node, state.indent + `local ${keyId}${valueIdStr} = next(${t});\n`);
	}
	idStack.push(keyId);
	return `{ ${keyId}${valueIdStr} }`;
}

function iterAccessor(
	state: CompilerState,
	node: ts.Node,
	t: string,
	key: number,
	idStack: Array<string>,
	isHole = false,
) {
	if (isHole) {
		state.pushPrecedingStatements(node, state.indent + `${t}.next();\n`);
		return "";
	} else {
		const id = state.getNewId();
		state.pushPrecedingStatements(node, state.indent + `local ${id} = ${t}.next();\n`);
		return `${id}.value`;
	}
}

function iterableFunctionAccessor(
	state: CompilerState,
	node: ts.Node,
	t: string,
	key: number,
	idStack: Array<string>,
	isHole = false,
) {
	if (isHole) {
		state.pushPrecedingStatements(node, state.indent + `${t}();\n`);
		return "";
	} else {
		return `${t}()`;
	}
}

export function getAccessorForBindingType(
	bindingPattern: BindingPattern | ts.ArrayLiteralExpression | ts.ObjectLiteralExpression,
) {
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
		if (ts.TypeGuards.isObjectBindingPattern(bindingPattern)) {
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

function compileArrayBindingPattern(state: CompilerState, bindingPattern: ts.ArrayBindingPattern, parentId: string) {
	let childIndex = 1;
	const idStack = new Array<string>();
	const getAccessor = getAccessorForBindingType(bindingPattern);
	for (const element of bindingPattern.getElements()) {
		if (ts.TypeGuards.isOmittedExpression(element)) {
			getAccessor(state, element, parentId, childIndex, idStack, true);
		} else {
			if (element.getDotDotDotToken()) {
				throw new CompilerError(
					"Operator ... is not supported for destructuring!",
					element,
					CompilerErrorType.SpreadDestructuring,
				);
			}
			const name = element.getNameNode();
			const rhs = getAccessor(state, name, parentId, childIndex, idStack);
			if (ts.TypeGuards.isIdentifier(name)) {
				checkReserved(name);
				const nameStr = compileExpression(state, name);
				state.pushPrecedingStatements(element, state.indent + `local ${nameStr} = ${rhs};\n`);
				const initializer = element.getInitializer();
				if (initializer) {
					state.pushPrecedingStatements(bindingPattern, compileParamDefault(state, initializer, nameStr));
				}
			} else {
				const id = state.getNewId();
				state.pushPrecedingStatements(bindingPattern, state.indent + `local ${id} = ${rhs};\n`);
				compileBindingPatternInner(state, name, id);
			}
		}
		childIndex++;
	}
}

function compileObjectBindingPattern(state: CompilerState, bindingPattern: ts.ObjectBindingPattern, parentId: string) {
	const getAccessor = getAccessorForBindingType(bindingPattern);
	for (const element of bindingPattern.getElements()) {
		if (element.getDotDotDotToken()) {
			throw new CompilerError(
				"Operator ... is not supported for destructuring!",
				element,
				CompilerErrorType.SpreadDestructuring,
			);
		}
		const name = element.getNameNode();
		const prop = element.getPropertyNameNode();
		if (ts.TypeGuards.isIdentifier(name)) {
			checkReserved(name);
			const nameStr = compileExpression(state, name);
			const rhs = objectAccessor(state, parentId, name, getAccessor, prop, name);
			state.pushPrecedingStatements(bindingPattern, state.indent + `local ${nameStr} = ${rhs};\n`);
		} else {
			const id = state.getNewId();
			const rhs = objectAccessor(state, parentId, name, getAccessor, prop, name);
			state.pushPrecedingStatements(bindingPattern, state.indent + `local ${id} = ${rhs};\n`);
			compileBindingPatternInner(state, name, id);
		}
	}
}

function compileBindingPatternInner(state: CompilerState, bindingPattern: BindingPattern, parentId: string) {
	if (ts.TypeGuards.isArrayBindingPattern(bindingPattern)) {
		compileArrayBindingPattern(state, bindingPattern, parentId);
	} else if (ts.TypeGuards.isObjectBindingPattern(bindingPattern)) {
		compileObjectBindingPattern(state, bindingPattern, parentId);
	}
}

export function compileBindingPatternAndJoin(state: CompilerState, bindingPattern: BindingPattern, parentId: string) {
	state.enterPrecedingStatementContext();
	compileBindingPatternInner(state, bindingPattern, parentId);
	return state.exitPrecedingStatementContextAndJoin();
}

export function compileBindingPattern(state: CompilerState, bindingPattern: BindingPattern, parentId: string) {
	state.enterPrecedingStatementContext();
	compileBindingPatternInner(state, bindingPattern, parentId);
	return state.exitPrecedingStatementContext().map(v => v.trim());
}

function compileArrayBindingLiteral(state: CompilerState, bindingLiteral: ts.ArrayLiteralExpression, parentId: string) {
	let childIndex = 1;
	const idStack = new Array<string>();
	const getAccessor = getAccessorForBindingType(bindingLiteral);
	for (const element of bindingLiteral.getElements()) {
		if (ts.TypeGuards.isOmittedExpression(element)) {
			getAccessor(state, element, parentId, childIndex, idStack, true);
		} else {
			const rhs = getAccessor(state, element, parentId, childIndex, idStack);
			if (
				ts.TypeGuards.isIdentifier(element) ||
				ts.TypeGuards.isElementAccessExpression(element) ||
				ts.TypeGuards.isPropertyAccessExpression(element)
			) {
				const nameStr = compileExpression(state, element);
				state.pushPrecedingStatements(bindingLiteral, state.indent + `${nameStr} = ${rhs};\n`);
			} else if (ts.TypeGuards.isBinaryExpression(element)) {
				const nameStr = compileExpression(state, skipNodesDownwards(element.getLeft()));
				state.pushPrecedingStatements(bindingLiteral, state.indent + `${nameStr} = ${rhs};\n`);
				const init = skipNodesDownwards(element.getRight());
				state.pushPrecedingStatements(init, compileParamDefault(state, init, nameStr));
			} else if (
				ts.TypeGuards.isArrayLiteralExpression(element) ||
				ts.TypeGuards.isObjectLiteralExpression(element)
			) {
				const id = state.getNewId();
				state.pushPrecedingStatements(bindingLiteral, state.indent + `local ${id} = ${rhs};\n`);
				compileBindingLiteralInner(state, element, id);
			} else {
				throw `Unexpected ${element.getKindName()} for compileArrayBindingLiteral`;
			}
		}
		childIndex++;
	}
}

function compileObjectBindingLiteral(
	state: CompilerState,
	bindingLiteral: ts.ObjectLiteralExpression,
	parentId: string,
) {
	const getAccessor = getAccessorForBindingType(bindingLiteral);
	for (const property of bindingLiteral.getProperties()) {
		if (ts.TypeGuards.isShorthandPropertyAssignment(property)) {
			const name = property.getNameNode();
			const nameStr = compileExpression(state, name);
			const rhs = objectAccessor(state, parentId, name, getAccessor, name, name);
			state.pushPrecedingStatements(bindingLiteral, state.indent + `local ${nameStr} = ${rhs};\n`);
			const init = property.getObjectAssignmentInitializer();
			if (init) {
				state.pushPrecedingStatements(bindingLiteral, compileParamDefault(state, init, nameStr));
			}
		} else if (ts.TypeGuards.isPropertyAssignment(property)) {
			const name = property.getNameNode();
			const initializer = property.getInitializerOrThrow();
			const rhs = objectAccessor(state, parentId, name, getAccessor, name, name);
			if (ts.TypeGuards.isIdentifier(initializer)) {
				const nameStr = compileExpression(state, initializer);
				state.pushPrecedingStatements(bindingLiteral, state.indent + `${nameStr} = ${rhs};\n`);
			} else if (ts.TypeGuards.isBinaryExpression(initializer)) {
				const nameStr = compileExpression(state, skipNodesDownwards(initializer.getLeft()));
				state.pushPrecedingStatements(bindingLiteral, state.indent + `${nameStr} = ${rhs};\n`);
				const init = skipNodesDownwards(initializer.getRight());
				state.pushPrecedingStatements(init, compileParamDefault(state, init, nameStr));
			} else if (
				ts.TypeGuards.isObjectLiteralExpression(initializer) ||
				ts.TypeGuards.isArrayLiteralExpression(initializer)
			) {
				const id = state.getNewId();
				state.pushPrecedingStatements(bindingLiteral, state.indent + `local ${id} = ${rhs};\n`);
				compileBindingLiteralInner(state, initializer, id);
			}
		} else {
			throw `Unexpected ${property.getKindName()} for compileObjectBindingLiteral`;
		}
	}
}

function compileBindingLiteralInner(state: CompilerState, bindingLiteral: BindingLiteral, parentId: string) {
	if (ts.TypeGuards.isArrayLiteralExpression(bindingLiteral)) {
		compileArrayBindingLiteral(state, bindingLiteral, parentId);
	} else if (ts.TypeGuards.isObjectLiteralExpression(bindingLiteral)) {
		compileObjectBindingLiteral(state, bindingLiteral, parentId);
	}
}

export function compileBindingLiteralAndJoin(state: CompilerState, bindingLiteral: BindingLiteral, parentId: string) {
	state.enterPrecedingStatementContext();
	compileBindingLiteralInner(state, bindingLiteral, parentId);
	return state.exitPrecedingStatementContextAndJoin();
}

export function compileBindingLiteral(state: CompilerState, bindingLiteral: BindingLiteral, parentId: string) {
	state.enterPrecedingStatementContext();
	compileBindingLiteralInner(state, bindingLiteral, parentId);
	return state.exitPrecedingStatementContext();
}
