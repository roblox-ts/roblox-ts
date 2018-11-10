export enum CompilerErrorType {
	MissingRootDir,
	MissingOutDir,
	MissingPartitionDir,
	MissingSourceFile,
	ImportNonModuleScript,
	InvalidImportAccess,
	GetImportPathFail1,
	GetImportPathFail2,
	GetImportPathFail3,
	NoRojoData,
	UnexpectedExtensionType,
}

export class CompilerError extends Error {
	constructor(message: string, public readonly type: CompilerErrorType) {
		super(message);
	}
}
