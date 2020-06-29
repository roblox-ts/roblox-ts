import * as luau from "LuauAST/bundle";

function makeGuard<T extends keyof luau.NodeByKind>(...kinds: [...Array<T>]) {
	return (node: luau.Node): node is luau.NodeByKind[T] => kinds.some(v => v === node.kind);
}

// indexable expressions
export const isAnyIdentifier = makeGuard(
	luau.SyntaxKind.Identifier,
	luau.SyntaxKind.EmptyIdentifier,
	luau.SyntaxKind.TemporaryIdentifier,
);
export const isIdentifier = makeGuard(luau.SyntaxKind.Identifier);
export const isEmptyIdentifier = makeGuard(luau.SyntaxKind.EmptyIdentifier);
export const isTemporaryIdentifier = makeGuard(luau.SyntaxKind.TemporaryIdentifier);
export const isComputedIndexExpression = makeGuard(luau.SyntaxKind.ComputedIndexExpression);
export const isPropertyAccessExpression = makeGuard(luau.SyntaxKind.PropertyAccessExpression);
export const isCallExpression = makeGuard(luau.SyntaxKind.CallExpression);
export const isMethodCallExpression = makeGuard(luau.SyntaxKind.MethodCallExpression);
export const isParenthesizedExpression = makeGuard(luau.SyntaxKind.ParenthesizedExpression);

export function isIndexableExpression(node: luau.Node): node is luau.IndexableExpression {
	return (
		node.kind >= luau.SyntaxKind.FirstIndexableExpression && node.kind <= luau.SyntaxKind.LastIndexableExpression
	);
}

// expressions
export const isNilLiteral = makeGuard(luau.SyntaxKind.NilLiteral);
export const isFalseLiteral = makeGuard(luau.SyntaxKind.FalseLiteral);
export const isTrueLiteral = makeGuard(luau.SyntaxKind.TrueLiteral);
export const isNumberLiteral = makeGuard(luau.SyntaxKind.NumberLiteral);
export const isStringLiteral = makeGuard(luau.SyntaxKind.StringLiteral);
export const isVarArgsLiteral = makeGuard(luau.SyntaxKind.VarArgsLiteral);
export const isFunctionExpression = makeGuard(luau.SyntaxKind.FunctionExpression);
export const isBinaryExpression = makeGuard(luau.SyntaxKind.BinaryExpression);
export const isUnaryExpression = makeGuard(luau.SyntaxKind.UnaryExpression);
export const isArray = makeGuard(luau.SyntaxKind.Array);
export const isMap = makeGuard(luau.SyntaxKind.Map);
export const isSet = makeGuard(luau.SyntaxKind.Set);
export const isMixedTable = makeGuard(luau.SyntaxKind.MixedTable);

export function isExpression(node: luau.Node): node is luau.Expression {
	return node.kind >= luau.SyntaxKind.FirstExpression && node.kind <= luau.SyntaxKind.LastExpression;
}

// statements
export const isAssignment = makeGuard(luau.SyntaxKind.Assignment);
export const isBreakStatement = makeGuard(luau.SyntaxKind.BreakStatement);
export const isCallStatement = makeGuard(luau.SyntaxKind.CallStatement);
export const isContinueStatement = makeGuard(luau.SyntaxKind.ContinueStatement);
export const isDoStatement = makeGuard(luau.SyntaxKind.DoStatement);
export const isWhileStatement = makeGuard(luau.SyntaxKind.WhileStatement);
export const isRepeatStatement = makeGuard(luau.SyntaxKind.RepeatStatement);
export const isIfStatement = makeGuard(luau.SyntaxKind.IfStatement);
export const isNumericForStatement = makeGuard(luau.SyntaxKind.NumericForStatement);
export const isForStatement = makeGuard(luau.SyntaxKind.ForStatement);
export const isFunctionDeclaration = makeGuard(luau.SyntaxKind.FunctionDeclaration);
export const isMethodDeclaration = makeGuard(luau.SyntaxKind.MethodDeclaration);
export const isVariableDeclaration = makeGuard(luau.SyntaxKind.VariableDeclaration);
export const isReturnStatement = makeGuard(luau.SyntaxKind.ReturnStatement);
export const isComment = makeGuard(luau.SyntaxKind.Comment);

export function isStatement(node: luau.Node): node is luau.Statement {
	return node.kind >= luau.SyntaxKind.FirstStatement && node.kind <= luau.SyntaxKind.LastStatement;
}

// fields
export const isMapField = makeGuard(luau.SyntaxKind.MapField);

export function isField(node: luau.Node): node is luau.Field {
	return node.kind >= luau.SyntaxKind.FirstField && node.kind <= luau.SyntaxKind.LastField;
}

export function isNode(value: unknown): value is luau.Node {
	if (typeof value === "object" && value !== null && "kind" in value) {
		// hack
		const { kind } = value as { kind: unknown };
		return (
			typeof kind === "number" &&
			kind >= luau.SyntaxKind.FirstIndexableExpression &&
			kind <= luau.SyntaxKind.LastField
		);
	}
	return false;
}

export const isSimple = makeGuard(
	luau.SyntaxKind.Identifier,
	luau.SyntaxKind.TemporaryIdentifier,
	luau.SyntaxKind.EmptyIdentifier,
	luau.SyntaxKind.NilLiteral,
	luau.SyntaxKind.TrueLiteral,
	luau.SyntaxKind.FalseLiteral,
	luau.SyntaxKind.NumberLiteral,
	luau.SyntaxKind.StringLiteral,
);

export const isSimplePrimitive = makeGuard(
	luau.SyntaxKind.NilLiteral,
	luau.SyntaxKind.TrueLiteral,
	luau.SyntaxKind.FalseLiteral,
	luau.SyntaxKind.NumberLiteral,
	luau.SyntaxKind.StringLiteral,
);

export const isTable = makeGuard(luau.SyntaxKind.Array, luau.SyntaxKind.Set, luau.SyntaxKind.Map);

export const isFinalStatement = makeGuard(luau.SyntaxKind.BreakStatement, luau.SyntaxKind.ReturnStatement);

export const isCall = makeGuard(luau.SyntaxKind.CallExpression, luau.SyntaxKind.MethodCallExpression);

export const isWritableExpression: (node: luau.Node) => node is luau.WritableExpression = makeGuard(
	luau.SyntaxKind.Identifier,
	luau.SyntaxKind.TemporaryIdentifier,
	luau.SyntaxKind.EmptyIdentifier,
	luau.SyntaxKind.PropertyAccessExpression,
	luau.SyntaxKind.ComputedIndexExpression,
);
