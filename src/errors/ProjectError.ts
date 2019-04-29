export enum ProjectErrorType {
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
	BadTsConfig,
}

export class ProjectError extends Error {
	constructor(message: string, public readonly type: ProjectErrorType) {
		super(message);
	}
}
