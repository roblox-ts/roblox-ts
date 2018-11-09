import * as ts from "ts-simple-ast";

export enum TranspilerErrorType {
	ReservedKeyword,
	ReservedMethodName,
	SpreadDestructuring,
	ParameterChildMissing,
	UnexpectedParameterType,
	NoLabeledStatement,
	BadStatement,
	MissingModuleFile,
	BadSpecifier,
	BadAncestor,
	BadExpressionStatement,
	UnexpectedBindingPattern,
	UnexpectedInitializer,
	ForEmptyVarName,
	NoVarKeyword,
	UndefinableMetamethod,
	NoConstructorReturn,
	NoThisOutsideClass,
	NoNull,
	BadExpression,
	BadFunctionBody,
	ExpectedPropertyAccessExpression,
	NoMacroMathExpressionStatement,
	NoXOROperator,
	UnrecognizedOperation1,
	UnrecognizedOperation2,
	UnrecognizedOperation3,
	NoEqualsEquals,
	NoExclamationEquals,
	BadBinaryExpression,
	BadPrefixUnaryExpression,
	BadPostfixUnaryExpression,
	NoParentheseslessNewExpression,
	InvalidClientOnlyAPIAccess,
	InvalidServerOnlyAPIAccess,
	NoFunctionIndex,
	NoClassPrototype,
	ExportInNonModuleScript,
	ModuleScriptContainsNoExports,
}

export class TranspilerError extends Error {
	constructor(message: string, public readonly node: ts.Node, public readonly type: TranspilerErrorType) {
		super(message);
	}
}
