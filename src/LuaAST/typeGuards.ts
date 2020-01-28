import * as lua from ".";
import { identity } from "../Shared/util/identity";
import { getKeysAsInt } from "../Shared/util/getKeysAsNumber";

function makeGuard<T extends keyof lua.NodeByKind>(kind: T) {
	return (node: lua.Node): node is lua.NodeByKind[T] => node.kind === kind;
}

// indexable expressions
export const isIdentifier = makeGuard(lua.SyntaxKind.Identifier);
export const isComputedIndexExpression = makeGuard(lua.SyntaxKind.ComputedIndexExpression);
export const isPropertyAccessExpression = makeGuard(lua.SyntaxKind.PropertyAccessExpression);
export const isCallExpression = makeGuard(lua.SyntaxKind.CallExpression);
export const isMethodCallExpression = makeGuard(lua.SyntaxKind.MethodCallExpression);
export const isParenthesizedExpression = makeGuard(lua.SyntaxKind.ParenthesizedExpression);

// enforces set has at least one of every key in lua.IndexableExpressionByKind
const INDEXABLE_EXPRESSION_KINDS: Set<lua.SyntaxKind> = new Set(
	getKeysAsInt(
		identity<{ [K in keyof lua.IndexableExpressionByKind]: true }>({
			[lua.SyntaxKind.Identifier]: true,
			[lua.SyntaxKind.ComputedIndexExpression]: true,
			[lua.SyntaxKind.PropertyAccessExpression]: true,
			[lua.SyntaxKind.CallExpression]: true,
			[lua.SyntaxKind.MethodCallExpression]: true,
			[lua.SyntaxKind.ParenthesizedExpression]: true,
		}),
	),
);

export function isIndexableExpression(node: lua.Node): node is lua.IndexableExpression {
	return INDEXABLE_EXPRESSION_KINDS.has(node.kind);
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

// enforces set has at least one of every key in lua.ExpressionByKind
const EXPRESSION_KINDS: Set<lua.SyntaxKind> = new Set(
	getKeysAsInt(
		identity<{ [K in keyof lua.ExpressionByKind]: true }>({
			// indexable expressions
			[lua.SyntaxKind.Identifier]: true,
			[lua.SyntaxKind.ComputedIndexExpression]: true,
			[lua.SyntaxKind.PropertyAccessExpression]: true,
			[lua.SyntaxKind.CallExpression]: true,
			[lua.SyntaxKind.MethodCallExpression]: true,
			[lua.SyntaxKind.ParenthesizedExpression]: true,

			// other expressions
			[lua.SyntaxKind.NilLiteral]: true,
			[lua.SyntaxKind.FalseLiteral]: true,
			[lua.SyntaxKind.TrueLiteral]: true,
			[lua.SyntaxKind.NumberLiteral]: true,
			[lua.SyntaxKind.StringLiteral]: true,
			[lua.SyntaxKind.VarArgsLiteral]: true,
			[lua.SyntaxKind.FunctionExpression]: true,
			[lua.SyntaxKind.BinaryExpression]: true,
			[lua.SyntaxKind.UnaryExpression]: true,
			[lua.SyntaxKind.Array]: true,
			[lua.SyntaxKind.Map]: true,
			[lua.SyntaxKind.Set]: true,
		}),
	),
);

export function isExpression(node: lua.Node): node is lua.Expression {
	return EXPRESSION_KINDS.has(node.kind);
}

// statements
export const isAssignment = makeGuard(lua.SyntaxKind.Assignment);
export const isCallStatement = makeGuard(lua.SyntaxKind.CallStatement);
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

// enforces set has at least one of every key in lua.StatementByKind
const STATEMENT_KINDS: Set<lua.SyntaxKind> = new Set(
	getKeysAsInt(
		identity<{ [K in keyof lua.StatementByKind]: true }>({
			[lua.SyntaxKind.Assignment]: true,
			[lua.SyntaxKind.CallStatement]: true,
			[lua.SyntaxKind.DoStatement]: true,
			[lua.SyntaxKind.WhileStatement]: true,
			[lua.SyntaxKind.RepeatStatement]: true,
			[lua.SyntaxKind.IfStatement]: true,
			[lua.SyntaxKind.NumericForStatement]: true,
			[lua.SyntaxKind.ForStatement]: true,
			[lua.SyntaxKind.FunctionDeclaration]: true,
			[lua.SyntaxKind.MethodDeclaration]: true,
			[lua.SyntaxKind.VariableDeclaration]: true,
			[lua.SyntaxKind.ReturnStatement]: true,
			[lua.SyntaxKind.Comment]: true,
		}),
	),
);

export function isStatement(node: lua.Node): node is lua.Statement {
	return STATEMENT_KINDS.has(node.kind);
}

// fields
export const isMapField = makeGuard(lua.SyntaxKind.MapField);

// enforces set has at least one of every key in lua.FieldByKind
const FIELD_KINDS: Set<lua.SyntaxKind> = new Set(
	getKeysAsInt(
		identity<{ [K in keyof lua.FieldByKind]: true }>({
			[lua.SyntaxKind.MapField]: true,
		}),
	),
);

export function isField(node: lua.Node): node is lua.Field {
	return FIELD_KINDS.has(node.kind);
}

export function isNode(value: unknown): value is lua.Node {
	if (typeof value === "object" && value !== null && "kind" in value) {
		// hack
		const node = value as { kind: unknown };
		if (typeof node.kind === "number") {
			return EXPRESSION_KINDS.has(node.kind) || STATEMENT_KINDS.has(node.kind) || FIELD_KINDS.has(node.kind);
		} else {
			return false;
		}
	}
	return false;
}
