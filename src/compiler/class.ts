import * as ts from "ts-morph";
import {
	checkMethodReserved,
	checkReserved,
	checkRoactReserved,
	compileConstructorDeclaration,
	compileExpression,
	compileMethodDeclaration,
	getRoactType,
	inheritsFromRoactComponent,
	ROACT_DERIVED_CLASSES_ERROR,
} from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	getType,
	isArrayType,
	shouldHoist,
	superExpressionClassInheritsFromArray,
	superExpressionClassInheritsFromSetOrMap,
} from "../typeUtilities";
import { bold, skipNodesDownwards } from "../utility";

const LUA_RESERVED_METAMETHODS = [
	"__index",
	"__newindex",
	"__add",
	"__sub",
	"__mul",
	"__div",
	"__mod",
	"__pow",
	"__unm",
	"__eq",
	"__lt",
	"__le",
	"__call",
	"__concat",
	"__tostring",
	"__len",
	"__metatable",
	"__mode",
];

function nonGetterOrSetter(prop: ts.ClassInstancePropertyTypes) {
	if (ts.TypeGuards.isGetAccessorDeclaration(prop) || ts.TypeGuards.isSetAccessorDeclaration(prop)) {
		throw new CompilerError(
			"Getters and Setters are disallowed! See https://github.com/roblox-ts/roblox-ts/issues/457",
			prop,
			CompilerErrorType.GettersSettersDisallowed,
		);
	}
	return prop;
}

function compileClassProperty(
	state: CompilerState,
	prop: ts.PropertyDeclaration | ts.ParameterDeclaration,
	name: string,
	precedingStatementContext: Array<string>,
) {
	const propNameNode = prop.getNameNode();

	if (propNameNode) {
		let propStr: string;
		if (ts.TypeGuards.isIdentifier(propNameNode)) {
			const propName = propNameNode.getText();
			propStr = "." + propName;
			checkMethodReserved(propName, prop);
		} else if (ts.TypeGuards.isStringLiteral(propNameNode)) {
			const expStr = compileExpression(state, propNameNode);
			checkMethodReserved(propNameNode.getLiteralText(), prop);
			propStr = `[${expStr}]`;
		} else if (ts.TypeGuards.isNumericLiteral(propNameNode)) {
			const expStr = compileExpression(state, propNameNode);
			propStr = `[${expStr}]`;
		} else if (ts.TypeGuards.isComputedPropertyName(propNameNode)) {
			// ComputedPropertyName
			const computedExp = propNameNode.getExpression();
			if (ts.TypeGuards.isStringLiteral(computedExp)) {
				checkMethodReserved(computedExp.getLiteralText(), prop);
			}
			const computedExpStr = compileExpression(state, computedExp);
			propStr = `[${computedExpStr}]`;
		} else {
			throw new CompilerError(
				`Unexpected prop type ${prop.getKindName()} in compileClass`,
				prop,
				CompilerErrorType.UnexpectedPropType,
				true,
			);
		}

		if (ts.TypeGuards.isInitializerExpressionableNode(prop) && prop.hasInitializer()) {
			state.enterPrecedingStatementContext(precedingStatementContext);
			const initializer = skipNodesDownwards(prop.getInitializer()!);
			state.declarationContext.set(initializer, {
				isIdentifier: false,
				set: `${name}${propStr}`,
			});
			const expStr = compileExpression(state, initializer);
			state.exitPrecedingStatementContext();
			if (state.declarationContext.delete(initializer)) {
				precedingStatementContext.push(state.indent, name, propStr, " = ", expStr, ";\n");
			}
		} else {
			precedingStatementContext.push(state.indent, name, propStr, " = nil;\n");
		}
	}
}

function getClassMethod(
	classDec: ts.ClassDeclaration | ts.ClassExpression,
	methodName: string,
	getter = (c: ts.ClassDeclaration | ts.ClassExpression, name: string) => c.getMethod(name),
): ts.MethodDeclaration | undefined {
	const method = getter(classDec, methodName);
	if (method) {
		return method;
	}
	const baseClass = classDec.getBaseClass();
	if (baseClass) {
		const baseMethod = getClassMethod(baseClass, methodName, getter);
		if (baseMethod) {
			return baseMethod;
		}
	} else {
		const extendsClass = classDec.getExtends();
		if (extendsClass) {
			const exp = extendsClass.getExpression();
			if (exp && ts.TypeGuards.isClassExpression(exp)) {
				const baseMethod = getClassMethod(exp, methodName, getter);
				if (baseMethod) {
					return baseMethod;
				}
			}
		}
	}
	return undefined;
}

function getClassStaticMethod(classDec: ts.ClassDeclaration | ts.ClassExpression, methodName: string) {
	return getClassMethod(classDec, methodName, (c, n) => c.getStaticMethod(n));
}

function getClassInstanceMethod(classDec: ts.ClassDeclaration | ts.ClassExpression, methodName: string) {
	return getClassMethod(classDec, methodName, (c, n) => c.getInstanceMethod(n));
}

function checkMethodCollision(node: ts.ClassDeclaration | ts.ClassExpression, method: ts.MethodDeclaration) {
	const methodName = method.getName();
	if (method.isStatic()) {
		if (getClassInstanceMethod(node, methodName)) {
			throw new CompilerError(
				`An instance method already exists with the name ${methodName}`,
				node,
				CompilerErrorType.MethodCollision,
			);
		}
	} else {
		if (getClassStaticMethod(node, methodName)) {
			throw new CompilerError(
				`A static method already exists with the name ${methodName}`,
				node,
				CompilerErrorType.MethodCollision,
			);
		}
	}
}

function getClassProperty(
	classDec: ts.ClassDeclaration | ts.ClassExpression,
	propName: string,
	getter: (c: ts.ClassDeclaration | ts.ClassExpression, n: string) => ts.ClassInstancePropertyTypes | undefined = (
		c,
		n,
	) => c.getProperty(n),
): ts.ClassInstancePropertyTypes | undefined {
	const property = getter(classDec, propName);
	if (property) {
		return property;
	}
	const baseClass = classDec.getBaseClass();
	if (baseClass) {
		const baseProp = getClassProperty(baseClass, propName, getter);
		if (baseProp) {
			return baseProp;
		}
	} else {
		const extendsClass = classDec.getExtends();
		if (extendsClass) {
			const exp = extendsClass.getExpression();
			if (exp && ts.TypeGuards.isClassExpression(exp)) {
				const baseProp = getClassProperty(exp, propName, getter);
				if (baseProp) {
					return baseProp;
				}
			}
		}
	}
	return undefined;
}

function getClassStaticProperty(classDec: ts.ClassDeclaration | ts.ClassExpression, propName: string) {
	return getClassProperty(classDec, propName, (c, n) => c.getStaticProperty(n));
}

function getClassInstanceProperty(classDec: ts.ClassDeclaration | ts.ClassExpression, propName: string) {
	return getClassProperty(classDec, propName, (c, n) => c.getInstanceProperty(n));
}

export function checkPropertyCollision(
	node: ts.ClassDeclaration | ts.ClassExpression,
	prop: ts.ClassInstancePropertyTypes,
) {
	const propName = prop.getName();
	if (!ts.TypeGuards.isParameterDeclaration(prop) && prop.isStatic()) {
		if (getClassInstanceProperty(node, propName)) {
			throw new CompilerError(
				`An instance property already exists with the name ${propName}`,
				node,
				CompilerErrorType.PropertyCollision,
			);
		}
	} else {
		if (getClassStaticProperty(node, propName)) {
			throw new CompilerError(
				`A static property already exists with the name ${propName}`,
				node,
				CompilerErrorType.PropertyCollision,
			);
		}
	}
}

function checkDecorators(
	node:
		| ts.ClassDeclaration
		| ts.ClassExpression
		| ts.ClassStaticPropertyTypes
		| ts.MethodDeclaration
		| ts.ClassInstancePropertyTypes,
) {
	if (node.getDecorators().length > 1) {
		throw new CompilerError("Decorators are not yet implemented!", node, CompilerErrorType.Decorator);
	}
}

// TODO: remove
function getConstructor(node: ts.ClassDeclaration | ts.ClassExpression) {
	for (const constructor of node.getConstructors()) {
		return constructor;
	}
}

function checkDefaultIterator<
	T extends ts.PropertyDeclaration | ts.ParameterDeclaration | ts.MethodDeclaration | ts.ClassStaticPropertyTypes
>(extendsArray: boolean, prop: T) {
	if (extendsArray && prop.getName() === "[Symbol.iterator]") {
		// This check is sufficient because TS only considers something as having an iterator when it is
		// literally `Symbol.iterator`. At present, writing Symbol or Symbol.iterator to another variable
		// is not considered valid by TS
		throw new CompilerError(
			`Cannot declare [Symbol.iterator] on class which extends from Array<T>`,
			prop,
			CompilerErrorType.DefaultIteratorOnArrayExtension,
		);
	}
}

function validateMethod(
	node: ts.ClassDeclaration | ts.ClassExpression,
	method: ts.MethodDeclaration,
	extendsArray: boolean,
	isRoact: boolean,
) {
	if (isRoact) {
		checkRoactReserved(node.getName() || "", method.getName(), node);
	}
	checkDecorators(method);
	checkMethodCollision(node, method);
	checkDefaultIterator(extendsArray, method);
	const nameNode = method.getNameNode();
	if (ts.TypeGuards.isComputedPropertyName(nameNode)) {
		let isSymbolPropAccess = false;
		const exp = skipNodesDownwards(nameNode.getExpression());
		if (ts.TypeGuards.isPropertyAccessExpression(exp)) {
			const subExp = skipNodesDownwards(exp.getExpression());
			if (ts.TypeGuards.isIdentifier(subExp) && subExp.getText() === "Symbol") {
				isSymbolPropAccess = true;
			}
		}

		if (!isSymbolPropAccess) {
			throw new CompilerError(
				"Cannot make a class with computed method names!",
				method,
				CompilerErrorType.ClassWithComputedMethodNames,
			);
		}
	}
}

function compileClassInitializer(
	state: CompilerState,
	node: ts.ClassDeclaration | ts.ClassExpression,
	results: Array<string>,
	name: string,
) {
	const prefix = ts.TypeGuards.isClassExpression(node) && node.getNameNode() ? "local " : "";
	if (node.getExtends()) {
		results.push(state.indent + `${prefix}${name} = setmetatable({}, { __index = super });\n`);
	} else {
		results.push(state.indent + `${prefix}${name} = {};\n`);
	}
	results.push(state.indent + `${name}.__index = ${name};\n`);
}

function compileRoactClassInitializer(
	state: CompilerState,
	node: ts.ClassDeclaration | ts.ClassExpression,
	results: Array<string>,
	name: string,
	roactType: string,
) {
	const prefix = ts.TypeGuards.isClassExpression(node) && node.getNameNode() ? "local " : "";
	results.push(state.indent + `${prefix}${name} = ${roactType}:extend("${name}");\n`);
}

function compileClass(state: CompilerState, node: ts.ClassDeclaration | ts.ClassExpression) {
	const name = node.getName() || state.getNewId();
	const nameNode = node.getNameNode();
	let expAlias: string | undefined;

	checkDecorators(node);

	if (nameNode) {
		checkReserved(name, nameNode, true);
	}

	if (ts.TypeGuards.isClassDeclaration(node)) {
		state.pushExport(name, node);
	}

	// Roact
	const roactType = getRoactType(node);
	const isRoact = roactType !== undefined;

	if (!isRoact && inheritsFromRoactComponent(node)) {
		throw new CompilerError(
			`Cannot inherit ${bold(node.getExtendsOrThrow().getText())}, must inherit ${bold("Roact.Component")}\n` +
				ROACT_DERIVED_CLASSES_ERROR,
			node,
			CompilerErrorType.RoactSubClassesNotSupported,
		);
	}

	let hasSuper = false;
	const results = new Array<string>();

	const isExpression = ts.TypeGuards.isClassExpression(node);

	if (isExpression) {
		results.push(state.indent + `local ${nameNode ? (expAlias = state.getNewId()) : name};\n`);
	} else {
		if (nameNode && shouldHoist(node, nameNode)) {
			state.pushHoistStack(name);
		} else {
			results.push(state.indent + `local ${name};\n`);
		}
	}
	results.push(state.indent + `do\n`);
	state.pushIndent();

	let extendsArray = false;

	const extendExp = node.getExtends();
	if (!isRoact && extendExp) {
		const extendExpExp = skipNodesDownwards(extendExp.getExpression());
		extendsArray = superExpressionClassInheritsFromArray(extendExpExp);
		hasSuper = !superExpressionClassInheritsFromArray(extendExpExp, false);

		if (superExpressionClassInheritsFromSetOrMap(extendExpExp)) {
			throw new CompilerError(
				"Cannot create a class which inherits from Map or Set!",
				extendExpExp,
				CompilerErrorType.BadClassExtends,
			);
		}

		state.enterPrecedingStatementContext(results);
		if (hasSuper) {
			results.push(
				state.indent +
					`local super = ${compileExpression(state, skipNodesDownwards(extendExp.getExpression()))};\n`,
			);
		}
		state.exitPrecedingStatementContext();
	}

	if (!isRoact) {
		compileClassInitializer(state, node, results, name);
	} else {
		compileRoactClassInitializer(state, node, results, name, roactType!);
	}

	for (const prop of node.getStaticProperties()) {
		checkDecorators(prop);
		checkPropertyCollision(node, prop);
		checkDefaultIterator(extendsArray, prop);
		if (isRoact) {
			checkRoactReserved(name, prop.getName(), node);
		}
		compileClassProperty(state, nonGetterOrSetter(prop), name, results);
	}

	for (const method of node.getStaticMethods()) {
		if (method.getBody() !== undefined) {
			const methodName = method.getName();

			if (methodName === "new" || LUA_RESERVED_METAMETHODS.includes(methodName)) {
				throw new CompilerError(
					`Cannot make a static method with name "${methodName}"!`,
					method,
					CompilerErrorType.BadStaticMethod,
				);
			}
			validateMethod(node, method, extendsArray, isRoact);
			state.enterPrecedingStatementContext(results);
			results.push(compileMethodDeclaration(state, method, name + "."));
			state.exitPrecedingStatementContext();
		}
	}

	if (!isRoact && !node.isAbstract()) {
		results.push(
			state.indent + `function ${name}.new(...)\n`,
			state.indent + `\tlocal self = setmetatable({}, ${name});\n`,
			state.indent + `\tself:constructor(...);\n`,
			state.indent + `\treturn self;\n`,
			state.indent + `end;\n`,
		);
	}

	const extraInitializers = new Array<string>();

	state.pushIndent();
	for (let prop of node.getInstanceProperties()) {
		checkDecorators(prop);
		checkPropertyCollision(node, prop);
		checkDefaultIterator(extendsArray, prop);
		prop = nonGetterOrSetter(prop);

		if (isRoact) {
			checkRoactReserved(name, prop.getName(), node);
		}

		if ((prop.getParent() as ts.ClassDeclaration | ts.ClassExpression) === node) {
			compileClassProperty(state, prop, "self", extraInitializers);
		}
	}
	state.popIndent();

	results.push(
		compileConstructorDeclaration(state, node, name, getConstructor(node), extraInitializers, hasSuper, isRoact),
	);

	for (const method of node.getInstanceMethods()) {
		if (method.getBody() !== undefined) {
			validateMethod(node, method, extendsArray, isRoact);
			state.enterPrecedingStatementContext(results);
			results.push(compileMethodDeclaration(state, method, name + ":"));
			state.exitPrecedingStatementContext();
		}
	}

	for (const metamethod of LUA_RESERVED_METAMETHODS) {
		if (getClassMethod(node, metamethod)) {
			throw new CompilerError(
				`Cannot use Lua metamethod as identifier '${metamethod}' for a class`,
				node,
				CompilerErrorType.UndefinableMetamethod,
			);
		}
	}

	if (getClassMethod(node, "toString")) {
		results.push(state.indent + `function ${name}:__tostring() return self:toString(); end;\n`);
		results.push(state.indent + `function ${name}.__concat(a, b) return tostring(a) .. tostring(b) end;\n`);
	}

	if (isExpression) {
		if (nameNode) {
			results.push(state.indent + `${expAlias} = ${name};\n`);
		}
		state.popIndent();
		results.push(state.indent + `end;\n`);
		state.pushPrecedingStatements(node, ...results);
		// Do not classify this as isPushed here.
		return expAlias || name;
	} else {
		state.popIndent();
		results.push(state.indent + `end;\n`);
	}

	return results.join("");
}

export function compileClassDeclaration(state: CompilerState, node: ts.ClassDeclaration) {
	return compileClass(state, node);
}

export function compileClassExpression(state: CompilerState, node: ts.ClassExpression) {
	return compileClass(state, node);
}

export function compileSuperExpression(state: CompilerState, node: ts.SuperExpression) {
	return isArrayType(getType(node)) ? "self" : "super";
}
