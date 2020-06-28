import * as lua from "LuaAST";

// base types
export interface Node<T extends lua.SyntaxKind = lua.SyntaxKind> {
	kind: T;
	parent?: lua.Node;
}

export interface IndexableExpression<
	T extends keyof lua.IndexableExpressionByKind = keyof lua.IndexableExpressionByKind
> extends lua.Node<T> {}

export interface Expression<T extends keyof lua.ExpressionByKind = keyof lua.ExpressionByKind> extends lua.Node<T> {}

export interface Statement<T extends keyof lua.StatementByKind = keyof lua.StatementByKind> extends lua.Node<T> {}

export interface Field<T extends keyof lua.FieldByKind = keyof lua.FieldByKind> extends lua.Node<T> {}

export interface HasParameters {
	parameters: lua.List<lua.AnyIdentifier>;
	hasDotDotDot: boolean;
}

export type AnyIdentifier = lua.Identifier | lua.EmptyIdentifier | lua.TemporaryIdentifier;

export type WritableExpression = lua.AnyIdentifier | lua.PropertyAccessExpression | lua.ComputedIndexExpression;

export type SimpleTypes =
	| lua.Identifier
	| lua.TemporaryIdentifier
	| lua.NilLiteral
	| lua.TrueLiteral
	| lua.FalseLiteral
	| lua.NumberLiteral
	| lua.StringLiteral;

// expressions
export interface NilLiteral extends lua.Expression<lua.SyntaxKind.NilLiteral> {}

export interface FalseLiteral extends lua.Expression<lua.SyntaxKind.FalseLiteral> {}

export interface TrueLiteral extends lua.Expression<lua.SyntaxKind.TrueLiteral> {}

export interface NumberLiteral extends lua.Expression<lua.SyntaxKind.NumberLiteral> {
	value: number;
}

export interface StringLiteral extends lua.Expression<lua.SyntaxKind.StringLiteral> {
	value: string;
}

export interface VarArgsLiteral extends lua.Expression<lua.SyntaxKind.VarArgsLiteral> {}

export interface FunctionExpression extends lua.Expression<lua.SyntaxKind.FunctionExpression>, HasParameters {
	statements: lua.List<lua.Statement>;
}

export interface Identifier extends lua.Expression<lua.SyntaxKind.Identifier> {
	name: string;
}

export interface EmptyIdentifier extends lua.Expression<lua.SyntaxKind.EmptyIdentifier> {}

export interface TemporaryIdentifier extends lua.Expression<lua.SyntaxKind.TemporaryIdentifier> {}

export interface ComputedIndexExpression extends lua.Expression<lua.SyntaxKind.ComputedIndexExpression> {
	expression: lua.IndexableExpression;
	index: lua.Expression;
}

export interface PropertyAccessExpression extends lua.Expression<lua.SyntaxKind.PropertyAccessExpression> {
	expression: lua.IndexableExpression;
	name: string;
}

export interface CallExpression extends lua.Expression<lua.SyntaxKind.CallExpression> {
	expression: lua.IndexableExpression;
	args: lua.List<lua.Expression>;
}

export interface MethodCallExpression extends lua.Expression<lua.SyntaxKind.MethodCallExpression> {
	name: string;
	expression: lua.IndexableExpression;
	args: lua.List<lua.Expression>;
}

export interface ParenthesizedExpression extends lua.Expression<lua.SyntaxKind.ParenthesizedExpression> {
	expression: lua.Expression;
}

export interface BinaryExpression extends lua.Expression<lua.SyntaxKind.BinaryExpression> {
	left: lua.Expression;
	operator: lua.BinaryOperator;
	right: lua.Expression;
}

export interface UnaryExpression extends lua.Expression<lua.SyntaxKind.UnaryExpression> {
	operator: lua.UnaryOperator;
	expression: lua.Expression;
}

export interface Array<T extends lua.Expression = lua.Expression> extends lua.Expression<lua.SyntaxKind.Array> {
	members: lua.List<T>;
}

export interface Map extends lua.Expression<lua.SyntaxKind.Map> {
	fields: lua.List<lua.MapField>;
}

export interface Set extends lua.Expression<lua.SyntaxKind.Set> {
	members: lua.List<lua.Expression>;
}

export interface MixedTable extends lua.Expression<lua.SyntaxKind.MixedTable> {
	fields: lua.List<lua.MapField | lua.Expression>;
}

// statements
export interface Assignment extends lua.Statement<lua.SyntaxKind.Assignment> {
	left: lua.WritableExpression | lua.List<lua.WritableExpression>;
	operator: lua.AssignmentOperator;
	right: lua.Expression;
}

export interface BreakStatement extends lua.Statement<lua.SyntaxKind.BreakStatement> {}

export interface CallStatement extends lua.Statement<lua.SyntaxKind.CallStatement> {
	expression: lua.CallExpression | lua.MethodCallExpression;
}

export interface ContinueStatement extends lua.Statement<lua.SyntaxKind.ContinueStatement> {}

export interface DoStatement extends lua.Statement<lua.SyntaxKind.DoStatement> {
	statements: lua.List<lua.Statement>;
}

export interface WhileStatement extends lua.Statement<lua.SyntaxKind.WhileStatement> {
	condition: lua.Expression;
	statements: lua.List<lua.Statement>;
}

export interface RepeatStatement extends lua.Statement<lua.SyntaxKind.RepeatStatement> {
	condition: lua.Expression;
	statements: lua.List<lua.Statement>;
}

export interface IfStatement extends lua.Statement<lua.SyntaxKind.IfStatement> {
	condition: lua.Expression;
	statements: lua.List<lua.Statement>;
	elseBody: lua.IfStatement | lua.List<lua.Statement>;
}

export interface NumericForStatement extends lua.Statement<lua.SyntaxKind.NumericForStatement> {
	id: lua.AnyIdentifier;
	start: lua.Expression;
	end: lua.Expression;
	step?: lua.Expression;
	statements: lua.List<lua.Statement>;
}

export interface ForStatement extends lua.Statement<lua.SyntaxKind.ForStatement> {
	ids: lua.List<lua.AnyIdentifier>;
	expression: lua.Expression;
	statements: lua.List<lua.Statement>;
}

export interface FunctionDeclaration extends lua.Statement<lua.SyntaxKind.FunctionDeclaration>, HasParameters {
	localize: boolean;
	name: lua.AnyIdentifier | lua.PropertyAccessExpression;
	statements: lua.List<lua.Statement>;
}

export interface MethodDeclaration extends lua.Statement<lua.SyntaxKind.MethodDeclaration>, HasParameters {
	expression: lua.IndexableExpression;
	name: string;
	statements: lua.List<lua.Statement>;
}

export interface VariableDeclaration extends lua.Statement<lua.SyntaxKind.VariableDeclaration> {
	left: lua.AnyIdentifier | lua.List<lua.AnyIdentifier>;
	right: lua.Expression | undefined;
}

export interface ReturnStatement extends lua.Statement<lua.SyntaxKind.ReturnStatement> {
	expression: lua.Expression | lua.List<lua.Expression>;
}

export interface Comment extends lua.Statement<lua.SyntaxKind.Comment> {
	text: string;
}

// fields
export interface MapField extends lua.Field<lua.SyntaxKind.MapField> {
	index: lua.Expression;
	value: lua.Expression;
}
