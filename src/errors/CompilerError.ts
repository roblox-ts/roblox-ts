import path from "path";
import * as ts from "ts-morph";
import { red } from "../textUtilities";

export enum CompilerErrorType {
	NoAny,
	ReservedKeyword,
	ReservedMethodName,
	SpreadDestructuring,
	ParameterChildMissing,
	NoLabeledStatement,
	BadStatement,
	MissingModuleFile,
	BadSpecifier,
	BadAncestor,
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
	NoEqualsEquals,
	NoExclamationEquals,
	BadBinaryExpression,
	BadPrefixUnaryExpression,
	BadPostfixUnaryExpression,
	InvalidClientOnlyAPIAccess,
	InvalidServerOnlyAPIAccess,
	NoFunctionIndex,
	NoClassPrototype,
	ExportInNonModuleScript,
	RoactSubClassesNotSupported,
	RoactJsxTextNotSupported,
	RoactNoNewComponentAllowed,
	RoactJsxWithoutImport,
	RoactNoReservedMethods,
	RoactInvalidSymbol,
	RoactInvalidPrimitive,
	RoactInvalidExpression,
	RoactInvalidCallExpression,
	RoactInvalidIdentifierExpression,
	RoactInvalidPropertyExpression,
	UnexpectedObjectIndex,
	NoDynamicImport,
	InvalidIdentifier,
	RobloxTSReservedIdentifier,
	BadContext,
	MixedMethodCall,
	InvalidService,
	ReservedNamespace,
	BadAddition,
	InvalidMacroIndex,
	NoTypeOf,
	BadBuiltinConstructorCall,
	BadForOfInitializer,
	ForInLoop,
	BadDestructuringType,
	NullableIndexOnMapOrSet,
	BadSpreadType,
	YieldNotInExpressionStatement,
	NonStringThrow,
	TryReturn,
	BadSwitchDefaultPosition,
	BadEnum,
	BadLuaTupleStatement,
	UnexpectedPropType,
	GlobalThis,
	BadStaticMethod,
	BadRojo,
	BadPackageScope,
	LuaTupleInConditional,
	InvalidComputedIndex,
	TupleLength,
	BadMethodCall,
	BadClassExtends,
	GettersSettersDisallowed,
	BadFunctionExpressionMethodCall,
	BadObjectPropertyType,
	BadSuperCall,
	DefaultIteratorOnArrayExtension,
	SuperArrayCall,
	Decorator,
	MethodCollision,
	PropertyCollision,
	ClassWithComputedMethodNames,
	IsolatedContainer,
	UnexpectedExtensionType,
}

export class CompilerError extends Error {
	constructor(
		message: string,
		public readonly node: ts.Node,
		public readonly type: CompilerErrorType,
		shouldNotHappen = false,
	) {
		super(
			message +
				(shouldNotHappen ? "\nPlease submit an issue at https://github.com/roblox-ts/roblox-ts/issues" : ""),
		);
	}

	public log(projectPath: string) {
		const node = this.node;
		if (ts.TypeGuards.isSourceFile(node)) {
			console.log(
				"%s - %s %s",
				path.relative(projectPath, this.node.getSourceFile().getFilePath()),
				red("Compiler Error:"),
				this.message,
			);
		} else {
			console.log(
				"%s:%d:%d - %s %s",
				path.relative(projectPath, this.node.getSourceFile().getFilePath()),
				this.node.getStartLineNumber(),
				this.node.getNonWhitespaceStart() - this.node.getStartLinePos(),
				red("Compiler Error:"),
				this.message,
			);
		}
	}
}
