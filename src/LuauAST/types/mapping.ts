import luau from "LuauAST";

export interface IndexableExpressionByKind {
	[luau.SyntaxKind.Identifier]: luau.Identifier;
	[luau.SyntaxKind.EmptyIdentifier]: luau.EmptyIdentifier;
	[luau.SyntaxKind.TemporaryIdentifier]: luau.TemporaryIdentifier;
	[luau.SyntaxKind.ComputedIndexExpression]: luau.ComputedIndexExpression;
	[luau.SyntaxKind.PropertyAccessExpression]: luau.PropertyAccessExpression;
	[luau.SyntaxKind.CallExpression]: luau.CallExpression;
	[luau.SyntaxKind.MethodCallExpression]: luau.MethodCallExpression;
	[luau.SyntaxKind.ParenthesizedExpression]: luau.ParenthesizedExpression;
}

export interface ExpressionByKind extends IndexableExpressionByKind {
	[luau.SyntaxKind.NilLiteral]: luau.NilLiteral;
	[luau.SyntaxKind.FalseLiteral]: luau.FalseLiteral;
	[luau.SyntaxKind.TrueLiteral]: luau.TrueLiteral;
	[luau.SyntaxKind.NumberLiteral]: luau.NumberLiteral;
	[luau.SyntaxKind.StringLiteral]: luau.StringLiteral;
	[luau.SyntaxKind.VarArgsLiteral]: luau.VarArgsLiteral;
	[luau.SyntaxKind.FunctionExpression]: luau.FunctionExpression;
	[luau.SyntaxKind.BinaryExpression]: luau.BinaryExpression;
	[luau.SyntaxKind.UnaryExpression]: luau.UnaryExpression;
	[luau.SyntaxKind.Array]: luau.Array;
	[luau.SyntaxKind.Map]: luau.Map;
	[luau.SyntaxKind.Set]: luau.Set;
	[luau.SyntaxKind.MixedTable]: luau.MixedTable;
}

export interface StatementByKind {
	[luau.SyntaxKind.Assignment]: luau.Assignment;
	[luau.SyntaxKind.BreakStatement]: luau.BreakStatement;
	[luau.SyntaxKind.CallStatement]: luau.CallStatement;
	[luau.SyntaxKind.ContinueStatement]: luau.ContinueStatement;
	[luau.SyntaxKind.DoStatement]: luau.DoStatement;
	[luau.SyntaxKind.WhileStatement]: luau.WhileStatement;
	[luau.SyntaxKind.RepeatStatement]: luau.RepeatStatement;
	[luau.SyntaxKind.IfStatement]: luau.IfStatement;
	[luau.SyntaxKind.NumericForStatement]: luau.NumericForStatement;
	[luau.SyntaxKind.ForStatement]: luau.ForStatement;
	[luau.SyntaxKind.FunctionDeclaration]: luau.FunctionDeclaration;
	[luau.SyntaxKind.MethodDeclaration]: luau.MethodDeclaration;
	[luau.SyntaxKind.VariableDeclaration]: luau.VariableDeclaration;
	[luau.SyntaxKind.ReturnStatement]: luau.ReturnStatement;
	[luau.SyntaxKind.Comment]: luau.Comment;
}

export interface FieldByKind {
	[luau.SyntaxKind.MapField]: luau.MapField;
}

export interface NodeByKind extends luau.ExpressionByKind, luau.StatementByKind, luau.FieldByKind {}
