import { addEvent } from "../analytics";
import { red } from "../utility/text";
import { LoggableError } from "./LoggableError";

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
	BadTsConfig,
	BadRbxTypes,
	BadRojoInclude,
	TsMorph,
	ProjectFailed,
	BadProjectPath,
	BadNodeModules,
}

export class ProjectError extends LoggableError {
	constructor(message: string, public readonly type: ProjectErrorType) {
		super(message);
		void addEvent("ProjectError", ProjectErrorType[type]);
	}

	public log() {
		console.log(red("Project Error:"), this.message);
	}
}
