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

// used to detect what category a given kind falls into
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
