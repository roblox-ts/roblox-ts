import * as lua from ".";

export interface IndexableExpressionByKind {
	[lua.SyntaxKind.Identifier]: lua.Identifier;
	[lua.SyntaxKind.ComputedIndexExpression]: lua.ComputedIndexExpression;
	[lua.SyntaxKind.PropertyAccessExpression]: lua.PropertyAccessExpression;
	[lua.SyntaxKind.CallExpression]: lua.CallExpression;
	[lua.SyntaxKind.MethodCallExpression]: lua.MethodCallExpression;
	[lua.SyntaxKind.ParenthesizedExpression]: lua.ParenthesizedExpression;
}

export interface ExpressionByKind extends IndexableExpressionByKind {
	[lua.SyntaxKind.NilLiteral]: lua.NilLiteral;
	[lua.SyntaxKind.FalseLiteral]: lua.FalseLiteral;
	[lua.SyntaxKind.TrueLiteral]: lua.TrueLiteral;
	[lua.SyntaxKind.NumberLiteral]: lua.NumberLiteral;
	[lua.SyntaxKind.StringLiteral]: lua.StringLiteral;
	[lua.SyntaxKind.VarArgsLiteral]: lua.VarArgsLiteral;
	[lua.SyntaxKind.FunctionExpression]: lua.FunctionExpression;
	[lua.SyntaxKind.BinaryExpression]: lua.BinaryExpression;
	[lua.SyntaxKind.UnaryExpression]: lua.UnaryExpression;
	[lua.SyntaxKind.Array]: lua.Array;
	[lua.SyntaxKind.Map]: lua.Map;
	[lua.SyntaxKind.Set]: lua.Set;
}

export interface StatementByKind {
	[lua.SyntaxKind.Assignment]: lua.Assignment;
	[lua.SyntaxKind.CallStatement]: lua.CallStatement;
	[lua.SyntaxKind.DoStatement]: lua.DoStatement;
	[lua.SyntaxKind.WhileStatement]: lua.WhileStatement;
	[lua.SyntaxKind.RepeatStatement]: lua.RepeatStatement;
	[lua.SyntaxKind.IfStatement]: lua.IfStatement;
	[lua.SyntaxKind.NumericForStatement]: lua.NumericForStatement;
	[lua.SyntaxKind.ForStatement]: lua.ForStatement;
	[lua.SyntaxKind.FunctionDeclaration]: lua.FunctionDeclaration;
	[lua.SyntaxKind.MethodDeclaration]: lua.MethodDeclaration;
	[lua.SyntaxKind.VariableDeclaration]: lua.VariableDeclaration;
	[lua.SyntaxKind.ReturnStatement]: lua.ReturnStatement;
	[lua.SyntaxKind.Comment]: lua.Comment;
}

export interface FieldByKind {
	[lua.SyntaxKind.MapField]: lua.MapField;
}

export interface NodeByKind extends lua.ExpressionByKind, lua.StatementByKind, lua.FieldByKind {}
