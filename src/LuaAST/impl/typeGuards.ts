import * as lua from "LuaAST";

function makeGuard<T extends keyof lua.NodeByKind>(...kinds: [...Array<T>]) {
	return (node: lua.Node): node is lua.NodeByKind[T] => kinds.some(v => v === node.kind);
}

// indexable expressions
export const isAnyIdentifier = makeGuard(
	lua.SyntaxKind.Identifier,
	lua.SyntaxKind.EmptyIdentifier,
	lua.SyntaxKind.TemporaryIdentifier,
);
export const isIdentifier = makeGuard(lua.SyntaxKind.Identifier);
export const isEmptyIdentifier = makeGuard(lua.SyntaxKind.EmptyIdentifier);
export const isTemporaryIdentifier = makeGuard(lua.SyntaxKind.TemporaryIdentifier);
export const isComputedIndexExpression = makeGuard(lua.SyntaxKind.ComputedIndexExpression);
export const isPropertyAccessExpression = makeGuard(lua.SyntaxKind.PropertyAccessExpression);
export const isCallExpression = makeGuard(lua.SyntaxKind.CallExpression);
export const isMethodCallExpression = makeGuard(lua.SyntaxKind.MethodCallExpression);
export const isParenthesizedExpression = makeGuard(lua.SyntaxKind.ParenthesizedExpression);

export function isIndexableExpression(node: lua.Node): node is lua.IndexableExpression {
	return node.kind >= lua.SyntaxKind.FirstIndexableExpression && node.kind <= lua.SyntaxKind.LastIndexableExpression;
}

// expressions
export const isNilLiteral = makeGuard(lua.SyntaxKind.NilLiteral);
export const isFalseLiteral = makeGuard(lua.SyntaxKind.FalseLiteral);
export const isTrueLiteral = makeGuard(lua.SyntaxKind.TrueLiteral);
export const isNumberLiteral = makeGuard(lua.SyntaxKind.NumberLiteral);
export const isStringLiteral = makeGuard(lua.SyntaxKind.StringLiteral);
export const isVarArgsLiteral = makeGuard(lua.SyntaxKind.VarArgsLiteral);
export const isFunctionExpression = makeGuard(lua.SyntaxKind.FunctionExpression);
export const isBinaryExpression = makeGuard(lua.SyntaxKind.BinaryExpression);
export const isUnaryExpression = makeGuard(lua.SyntaxKind.UnaryExpression);
export const isArray = makeGuard(lua.SyntaxKind.Array);
export const isMap = makeGuard(lua.SyntaxKind.Map);
export const isSet = makeGuard(lua.SyntaxKind.Set);

export function isExpression(node: lua.Node): node is lua.Expression {
	return node.kind >= lua.SyntaxKind.FirstExpression && node.kind <= lua.SyntaxKind.LastExpression;
}

// statements
export const isAssignment = makeGuard(lua.SyntaxKind.Assignment);
export const isBreakStatement = makeGuard(lua.SyntaxKind.BreakStatement);
export const isCallStatement = makeGuard(lua.SyntaxKind.CallStatement);
export const isContinueStatement = makeGuard(lua.SyntaxKind.ContinueStatement);
export const isDoStatement = makeGuard(lua.SyntaxKind.DoStatement);
export const isWhileStatement = makeGuard(lua.SyntaxKind.WhileStatement);
export const isRepeatStatement = makeGuard(lua.SyntaxKind.RepeatStatement);
export const isIfStatement = makeGuard(lua.SyntaxKind.IfStatement);
export const isNumericForStatement = makeGuard(lua.SyntaxKind.NumericForStatement);
export const isForStatement = makeGuard(lua.SyntaxKind.ForStatement);
export const isFunctionDeclaration = makeGuard(lua.SyntaxKind.FunctionDeclaration);
export const isMethodDeclaration = makeGuard(lua.SyntaxKind.MethodDeclaration);
export const isVariableDeclaration = makeGuard(lua.SyntaxKind.VariableDeclaration);
export const isReturnStatement = makeGuard(lua.SyntaxKind.ReturnStatement);
export const isComment = makeGuard(lua.SyntaxKind.Comment);

export function isStatement(node: lua.Node): node is lua.Statement {
	return node.kind >= lua.SyntaxKind.FirstStatement && node.kind <= lua.SyntaxKind.LastStatement;
}

// fields
export const isMapField = makeGuard(lua.SyntaxKind.MapField);

export function isField(node: lua.Node): node is lua.Field {
	return node.kind >= lua.SyntaxKind.FirstField && node.kind <= lua.SyntaxKind.LastField;
}

export function isNode(value: unknown): value is lua.Node {
	if (typeof value === "object" && value !== null && "kind" in value) {
		// hack
		const { kind } = value as { kind: unknown };
		return (
			typeof kind === "number" &&
			kind >= lua.SyntaxKind.FirstIndexableExpression &&
			kind <= lua.SyntaxKind.LastField
		);
	}
	return false;
}

export const isSimple = makeGuard(
	lua.SyntaxKind.Identifier,
	lua.SyntaxKind.TemporaryIdentifier,
	lua.SyntaxKind.NilLiteral,
	lua.SyntaxKind.TrueLiteral,
	lua.SyntaxKind.FalseLiteral,
	lua.SyntaxKind.NumberLiteral,
	lua.SyntaxKind.StringLiteral,
);

export const isSimplePrimitive = makeGuard(
	lua.SyntaxKind.NilLiteral,
	lua.SyntaxKind.TrueLiteral,
	lua.SyntaxKind.FalseLiteral,
	lua.SyntaxKind.NumberLiteral,
	lua.SyntaxKind.StringLiteral,
);

export const isTable = makeGuard(lua.SyntaxKind.Array, lua.SyntaxKind.Set, lua.SyntaxKind.Map);

export const isFinalStatement = makeGuard(lua.SyntaxKind.BreakStatement, lua.SyntaxKind.ReturnStatement);

export const isCall = makeGuard(lua.SyntaxKind.CallExpression, lua.SyntaxKind.MethodCallExpression);
