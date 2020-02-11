export enum SyntaxKind {
	// indexable expressions
	Identifier,
	TemporaryIdentifier,
	ComputedIndexExpression,
	PropertyAccessExpression,
	CallExpression,
	MethodCallExpression,
	ParenthesizedExpression,

	// expressions
	NilLiteral,
	FalseLiteral,
	TrueLiteral,
	NumberLiteral,
	StringLiteral,
	VarArgsLiteral,
	FunctionExpression,
	BinaryExpression,
	UnaryExpression,
	Array,
	Map,
	Set,

	// statements
	Assignment,
	CallStatement,
	DoStatement,
	WhileStatement,
	RepeatStatement,
	IfStatement,
	NumericForStatement,
	ForStatement,
	FunctionDeclaration,
	MethodDeclaration,
	VariableDeclaration,
	ReturnStatement,
	Comment,

	// fields
	MapField,
}

export enum SyntaxKind {
	FirstIndexableExpression = Identifier,
	LastIndexableExpression = ParenthesizedExpression,
	FirstExpression = Identifier,
	LastExpression = Set,
	FirstStatement = Assignment,
	LastStatement = Comment,
	FirstField = MapField,
	LastField = MapField,
}

export enum BinaryOperator {
	Plus,
	Minus,
	Asterisk,
	Slash,
	Caret,
	Percent,
	DotDot,
	LessThan,
	LessThanEquals,
	MoreThan,
	MoreThanEquals,
	EqualEquals,
	TildeEquals,
	And,
	Or,
}

export enum UnaryOperator {
	Minus,
	Not,
	Octothorpe,
}
