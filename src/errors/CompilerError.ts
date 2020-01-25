import path from "path";
import * as ts from "ts-morph";
import { addEvent } from "../analytics";
import { red } from "../utility/text";
import { LoggableError } from "./LoggableError";

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
	RoactSelfClosingFragment,
	RoactInvalidExpression,
	RoactInvalidCallExpression,
	RoactInvalidIdentifierExpression,
	RoactInvalidPropertyExpression,
	RoactInvalidKeyUsage,
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
	BadDestructSubType,
	MixedMethodSet,
	BadNamespaceExport,
	NoEnumMerging,
	NoTryStatement,
	TS37,
}

export class CompilerError extends LoggableError {
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
		void addEvent("CompilerError", CompilerErrorType[type]);
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
