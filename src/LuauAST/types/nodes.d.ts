import luau from "LuauAST";

// base types
export interface Node<T extends luau.SyntaxKind = luau.SyntaxKind> {
	kind: T;
	parent?: luau.Node;
}

export interface IndexableExpression<
	T extends keyof luau.IndexableExpressionByKind = keyof luau.IndexableExpressionByKind
> extends luau.Node<T> {}

export interface Expression<T extends keyof luau.ExpressionByKind = keyof luau.ExpressionByKind> extends luau.Node<T> {}

export interface Statement<T extends keyof luau.StatementByKind = keyof luau.StatementByKind> extends luau.Node<T> {}

export interface Field<T extends keyof luau.FieldByKind = keyof luau.FieldByKind> extends luau.Node<T> {}

export interface HasParameters {
	parameters: luau.List<luau.AnyIdentifier>;
	hasDotDotDot: boolean;
}

export type AnyIdentifier = luau.Identifier | luau.EmptyIdentifier | luau.TemporaryIdentifier;

export type WritableExpression = luau.AnyIdentifier | luau.PropertyAccessExpression | luau.ComputedIndexExpression;

export type SimpleTypes =
	| luau.Identifier
	| luau.TemporaryIdentifier
	| luau.NilLiteral
	| luau.TrueLiteral
	| luau.FalseLiteral
	| luau.NumberLiteral
	| luau.StringLiteral;

// expressions
export interface NilLiteral extends luau.Expression<luau.SyntaxKind.NilLiteral> {}

export interface FalseLiteral extends luau.Expression<luau.SyntaxKind.FalseLiteral> {}

export interface TrueLiteral extends luau.Expression<luau.SyntaxKind.TrueLiteral> {}

export interface NumberLiteral extends luau.Expression<luau.SyntaxKind.NumberLiteral> {
	value: string;
}

export interface StringLiteral extends luau.Expression<luau.SyntaxKind.StringLiteral> {
	value: string;
}

export interface VarArgsLiteral extends luau.Expression<luau.SyntaxKind.VarArgsLiteral> {}

export interface FunctionExpression extends luau.Expression<luau.SyntaxKind.FunctionExpression>, HasParameters {
	statements: luau.List<luau.Statement>;
}

export interface Identifier extends luau.Expression<luau.SyntaxKind.Identifier> {
	name: string;
}

export interface EmptyIdentifier extends luau.Expression<luau.SyntaxKind.EmptyIdentifier> {}

export interface TemporaryIdentifier extends luau.Expression<luau.SyntaxKind.TemporaryIdentifier> {}

export interface ComputedIndexExpression extends luau.Expression<luau.SyntaxKind.ComputedIndexExpression> {
	expression: luau.IndexableExpression;
	index: luau.Expression;
}

export interface PropertyAccessExpression extends luau.Expression<luau.SyntaxKind.PropertyAccessExpression> {
	expression: luau.IndexableExpression;
	name: string;
}

export interface CallExpression extends luau.Expression<luau.SyntaxKind.CallExpression> {
	expression: luau.IndexableExpression;
	args: luau.List<luau.Expression>;
}

export interface MethodCallExpression extends luau.Expression<luau.SyntaxKind.MethodCallExpression> {
	name: string;
	expression: luau.IndexableExpression;
	args: luau.List<luau.Expression>;
}

export interface ParenthesizedExpression extends luau.Expression<luau.SyntaxKind.ParenthesizedExpression> {
	expression: luau.Expression;
}

export interface BinaryExpression extends luau.Expression<luau.SyntaxKind.BinaryExpression> {
	left: luau.Expression;
	operator: luau.BinaryOperator;
	right: luau.Expression;
}

export interface UnaryExpression extends luau.Expression<luau.SyntaxKind.UnaryExpression> {
	operator: luau.UnaryOperator;
	expression: luau.Expression;
}

export interface Array<T extends luau.Expression = luau.Expression> extends luau.Expression<luau.SyntaxKind.Array> {
	members: luau.List<T>;
}

export interface Map extends luau.Expression<luau.SyntaxKind.Map> {
	fields: luau.List<luau.MapField>;
}

export interface Set extends luau.Expression<luau.SyntaxKind.Set> {
	members: luau.List<luau.Expression>;
}

export interface MixedTable extends luau.Expression<luau.SyntaxKind.MixedTable> {
	fields: luau.List<luau.MapField | luau.Expression>;
}

// statements
export interface Assignment extends luau.Statement<luau.SyntaxKind.Assignment> {
	left: luau.WritableExpression | luau.List<luau.WritableExpression>;
	operator: luau.AssignmentOperator;
	right: luau.Expression;
}

export interface BreakStatement extends luau.Statement<luau.SyntaxKind.BreakStatement> {}

export interface CallStatement extends luau.Statement<luau.SyntaxKind.CallStatement> {
	expression: luau.CallExpression | luau.MethodCallExpression;
}

export interface ContinueStatement extends luau.Statement<luau.SyntaxKind.ContinueStatement> {}

export interface DoStatement extends luau.Statement<luau.SyntaxKind.DoStatement> {
	statements: luau.List<luau.Statement>;
}

export interface WhileStatement extends luau.Statement<luau.SyntaxKind.WhileStatement> {
	condition: luau.Expression;
	statements: luau.List<luau.Statement>;
}

export interface RepeatStatement extends luau.Statement<luau.SyntaxKind.RepeatStatement> {
	condition: luau.Expression;
	statements: luau.List<luau.Statement>;
}

export interface IfStatement extends luau.Statement<luau.SyntaxKind.IfStatement> {
	condition: luau.Expression;
	statements: luau.List<luau.Statement>;
	elseBody: luau.IfStatement | luau.List<luau.Statement>;
}

export interface NumericForStatement extends luau.Statement<luau.SyntaxKind.NumericForStatement> {
	id: luau.AnyIdentifier;
	start: luau.Expression;
	end: luau.Expression;
	step?: luau.Expression;
	statements: luau.List<luau.Statement>;
}

export interface ForStatement extends luau.Statement<luau.SyntaxKind.ForStatement> {
	ids: luau.List<luau.AnyIdentifier>;
	expression: luau.Expression;
	statements: luau.List<luau.Statement>;
}

export interface FunctionDeclaration extends luau.Statement<luau.SyntaxKind.FunctionDeclaration>, HasParameters {
	localize: boolean;
	name: luau.AnyIdentifier | luau.PropertyAccessExpression;
	statements: luau.List<luau.Statement>;
}

export interface MethodDeclaration extends luau.Statement<luau.SyntaxKind.MethodDeclaration>, HasParameters {
	expression: luau.IndexableExpression;
	name: string;
	statements: luau.List<luau.Statement>;
}

export interface VariableDeclaration extends luau.Statement<luau.SyntaxKind.VariableDeclaration> {
	left: luau.AnyIdentifier | luau.List<luau.AnyIdentifier>;
	right: luau.Expression | undefined;
}

export interface ReturnStatement extends luau.Statement<luau.SyntaxKind.ReturnStatement> {
	expression: luau.Expression | luau.List<luau.Expression>;
}

export interface Comment extends luau.Statement<luau.SyntaxKind.Comment> {
	text: string;
}

// fields
export interface MapField extends luau.Field<luau.SyntaxKind.MapField> {
	index: luau.Expression;
	value: luau.Expression;
}
