// helper creation
import * as lua from "LuaAST";

// creation
export function create<T extends keyof lua.NodeByKind>(
	kind: T,
	fields: {
		[K in Exclude<keyof lua.NodeByKind[T], keyof lua.Node>]: lua.NodeByKind[T][K];
	},
): lua.NodeByKind[T] {
	// super hack!
	const node = (Object.assign({ kind }, fields) as unknown) as lua.NodeByKind[T];

	// if value is node, value.Parent = node
	// if value is list, lua.list.forEach(value, subValue => subValue.Parent = node)
	for (const value of Object.values(fields)) {
		if (lua.isNode(value)) {
			value.parent = node;
		} else if (lua.list.isList(value)) {
			lua.list.forEach(value, subValue => (subValue.parent = node));
		}
	}

	return node;
}

export function number(value: number) {
	return lua.create(lua.SyntaxKind.NumberLiteral, { value });
}

export function string(value: string) {
	return lua.create(lua.SyntaxKind.StringLiteral, { value });
}

export function id(name: string) {
	return lua.create(lua.SyntaxKind.Identifier, { name });
}

export function parentheses(expression: lua.Expression) {
	return lua.create(lua.SyntaxKind.ParenthesizedExpression, { expression });
}

export function binary(left: lua.Expression, operator: lua.BinaryOperator, right: lua.Expression) {
	return lua.create(lua.SyntaxKind.BinaryExpression, { left, operator, right });
}

export function func(args: Array<lua.Identifier> = [], hasVarArgs = false, statements: Array<lua.Statement> = []) {
	return lua.create(lua.SyntaxKind.FunctionExpression, {
		args: lua.list.make(...args),
		hasVarArgs,
		statements: lua.list.make(...statements),
	});
}

export function funcDec(
	name: string,
	args: Array<lua.Identifier> = [],
	hasVarArgs = false,
	statements: Array<lua.Statement> = [],
) {
	return lua.create(lua.SyntaxKind.FunctionDeclaration, {
		name: lua.create(lua.SyntaxKind.Identifier, { name }),
		args: lua.list.make(...args),
		hasVarArgs,
		statements: lua.list.make(...statements),
	});
}

export function methodDec(
	expression: lua.IndexableExpression,
	name: string,
	args: Array<lua.Identifier> = [],
	hasVarArgs: boolean,
	statements: Array<lua.Statement> = [],
) {
	return lua.create(lua.SyntaxKind.MethodDeclaration, {
		expression,
		name: lua.create(lua.SyntaxKind.Identifier, { name }),
		args: lua.list.make(...args),
		hasVarArgs,
		statements: lua.list.make(...statements),
	});
}

export function varDec(name: string, value: lua.Expression) {
	return lua.create(lua.SyntaxKind.VariableDeclaration, {
		id: lua.id(name),
		value,
	});
}

export function call(expression: lua.Expression, params: Array<lua.Expression>) {
	return lua.create(lua.SyntaxKind.CallStatement, {
		expression: lua.callExp(expression, params),
	});
}

export function methodCall(expression: lua.Expression, methodName: string, params: Array<lua.Expression>) {
	return lua.create(lua.SyntaxKind.CallStatement, {
		expression: lua.methodCallExp(expression, methodName, params),
	});
}

export function callExp(expression: lua.Expression, params: Array<lua.Expression>) {
	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.isIndexableExpression(expression) ? expression : lua.parentheses(expression),
		params: lua.list.make(...params),
	});
}

export function methodCallExp(expression: lua.Expression, methodName: string, params: Array<lua.Expression>) {
	return lua.create(lua.SyntaxKind.MethodCallExpression, {
		expression: lua.isIndexableExpression(expression) ? expression : lua.parentheses(expression),
		name: lua.id(methodName),
		params: lua.list.make(...params),
	});
}

export function bool(value: boolean) {
	if (value) {
		return lua.create(lua.SyntaxKind.TrueLiteral, {});
	} else {
		return lua.create(lua.SyntaxKind.FalseLiteral, {});
	}
}

export function field(name: string, value: lua.Expression) {
	return lua.create(lua.SyntaxKind.MapField, { name: lua.id(name), value });
}

export function whileDo(condition: lua.Expression, statements: Array<lua.Statement> = []) {
	return lua.create(lua.SyntaxKind.WhileStatement, {
		condition,
		statements: lua.list.make(...statements),
	});
}

export function comment(text: string) {
	return lua.create(lua.SyntaxKind.Comment, { text });
}

export function primitive(value: undefined | boolean | number | string) {
	if (typeof value === "undefined") {
		return lua.create(lua.SyntaxKind.NilLiteral, {});
	} else if (typeof value === "boolean") {
		return lua.create(value ? lua.SyntaxKind.TrueLiteral : lua.SyntaxKind.FalseLiteral, {});
	} else if (typeof value === "number") {
		return lua.create(lua.SyntaxKind.NumberLiteral, { value });
	} else {
		return lua.create(lua.SyntaxKind.StringLiteral, { value });
	}
}
