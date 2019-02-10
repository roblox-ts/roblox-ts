import * as ts from "ts-morph";
import { checkApiAccess, transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { isArrayType, isTupleType, typeConstraint } from "../typeUtilities";

const STRING_MACRO_METHODS = [
	"byte",
	"find",
	"format",
	"gmatch",
	"gsub",
	"len",
	"lower",
	"match",
	"rep",
	"reverse",
	"sub",
	"upper",
];

const RBX_MATH_CLASSES = ["CFrame", "UDim", "UDim2", "Vector2", "Vector2int16", "Vector3", "Vector3int16"];

export function transpileArguments(state: TranspilerState, args: Array<ts.Node>) {
	return args.map(arg => transpileExpression(state, arg as ts.Expression)).join(", ");
}

export function transpileCallExpression(state: TranspilerState, node: ts.CallExpression, doNotWrapTupleReturn = false) {
	const exp = node.getExpression();
	if (ts.TypeGuards.isPropertyAccessExpression(exp)) {
		return transpilePropertyCallExpression(state, node, doNotWrapTupleReturn);
	} else if (ts.TypeGuards.isSuperExpression(exp)) {
		let params = transpileArguments(state, node.getArguments());
		if (params.length > 0) {
			params = ", " + params;
		}
		params = "self" + params;
		const className = exp
			.getType()
			.getSymbolOrThrow()
			.getName();
		return `${className}.constructor(${params})`;
	} else {
		const callPath = transpileExpression(state, exp);
		const params = transpileArguments(state, node.getArguments());
		let result = `${callPath}(${params})`;
		if (!doNotWrapTupleReturn && isTupleType(node.getReturnType())) {
			result = `{ ${result} }`;
		}
		return result;
	}
}

export function transpilePropertyCallExpression(
	state: TranspilerState,
	node: ts.CallExpression,
	doNotWrapTupleReturn = false,
) {
	const expression = node.getExpression();
	if (!ts.TypeGuards.isPropertyAccessExpression(expression)) {
		throw new TranspilerError(
			"Expected PropertyAccessExpression",
			node,
			TranspilerErrorType.ExpectedPropertyAccessExpression,
		);
	}

	checkApiAccess(state, expression.getNameNode());

	const subExp = expression.getExpression();
	const subExpType = subExp.getType();
	let accessPath = transpileExpression(state, subExp);
	const property = expression.getName();
	let params = transpileArguments(state, node.getArguments());

	if (isArrayType(subExpType)) {
		let paramStr = accessPath;
		if (params.length > 0) {
			paramStr += ", " + params;
		}
		state.usesTSLibrary = true;
		return `TS.array_${property}(${paramStr})`;
	}

	if (subExpType.isString() || subExpType.isStringLiteral()) {
		let paramStr = accessPath;
		if (params.length > 0) {
			paramStr += ", " + params;
		}
		if (STRING_MACRO_METHODS.indexOf(property) !== -1) {
			return `string.${property}(${paramStr})`;
		}
		state.usesTSLibrary = true;
		return `TS.string_${property}(${paramStr})`;
	}

	const subExpTypeSym = subExpType.getSymbol();
	if (subExpTypeSym && ts.TypeGuards.isPropertyAccessExpression(expression)) {
		const subExpTypeName = subExpTypeSym.getEscapedName();

		// custom promises
		if (subExpTypeName === "Promise") {
			if (property === "then") {
				return `${accessPath}:andThen(${params})`;
			}
		}

		// for is a reserved word in Lua
		if (subExpTypeName === "SymbolConstructor") {
			if (property === "for") {
				return `${accessPath}.getFor(${params})`;
			}
		}

		if (subExpTypeName === "Map" || subExpTypeName === "ReadonlyMap" || subExpTypeName === "WeakMap") {
			let paramStr = accessPath;
			if (params.length > 0) {
				paramStr += ", " + params;
			}
			state.usesTSLibrary = true;
			return `TS.map_${property}(${paramStr})`;
		}

		if (subExpTypeName === "Set" || subExpTypeName === "ReadonlySet" || subExpTypeName === "WeakSet") {
			let paramStr = accessPath;
			if (params.length > 0) {
				paramStr += ", " + params;
			}
			state.usesTSLibrary = true;
			return `TS.set_${property}(${paramStr})`;
		}

		if (subExpTypeName === "ObjectConstructor") {
			state.usesTSLibrary = true;
			return `TS.Object_${property}(${params})`;
		}

		const validateMathCall = () => {
			if (ts.TypeGuards.isExpressionStatement(node.getParent())) {
				throw new TranspilerError(
					`${subExpTypeName}.${property}() cannot be an expression statement!`,
					node,
					TranspilerErrorType.NoMacroMathExpressionStatement,
				);
			}
		};

		// custom math
		if (RBX_MATH_CLASSES.indexOf(subExpTypeName) !== -1) {
			switch (property) {
				case "add":
					validateMathCall();
					return `(${accessPath} + (${params}))`;
				case "sub":
					validateMathCall();
					return `(${accessPath} - (${params}))`;
				case "mul":
					validateMathCall();
					return `(${accessPath} * (${params}))`;
				case "div":
					validateMathCall();
					return `(${accessPath} / (${params}))`;
			}
		}
	}

	const expType = expression.getType();

	const allMethods = typeConstraint(expType, t =>
		t
			.getSymbolOrThrow()
			.getDeclarations()
			.every(dec => ts.TypeGuards.isMethodDeclaration(dec) || ts.TypeGuards.isMethodSignature(dec)),
	);

	const allCallbacks = typeConstraint(expType, t =>
		t
			.getSymbolOrThrow()
			.getDeclarations()
			.every(
				dec =>
					ts.TypeGuards.isFunctionTypeNode(dec) ||
					ts.TypeGuards.isFunctionExpression(dec) ||
					ts.TypeGuards.isArrowFunction(dec) ||
					ts.TypeGuards.isFunctionDeclaration(dec),
			),
	);

	let sep: string;
	if (allMethods && !allCallbacks) {
		if (ts.TypeGuards.isSuperExpression(subExp)) {
			const className = subExp
				.getType()
				.getSymbolOrThrow()
				.getName();
			accessPath = className + ".__index";
			params = "self" + (params.length > 0 ? ", " : "") + params;
			sep = ".";
		} else {
			sep = ":";
		}
	} else if (!allMethods && allCallbacks) {
		sep = ".";
	} else {
		// mixed methods and callbacks
		throw new TranspilerError(
			"Attempted to call a function with mixed types! All definitions must either be a method or a callback.",
			node,
			TranspilerErrorType.MixedMethodCall,
		);
	}

	let result = `${accessPath}${sep}${property}(${params})`;
	if (!doNotWrapTupleReturn && isTupleType(node.getReturnType())) {
		result = `{ ${result} }`;
	}
	return result;
}
