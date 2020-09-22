import ts from "byots";
import { LoggableError } from "Shared/errors/LoggableError";
import { formatDiagnostics } from "Shared/util/formatDiagnostics";

export class ProjectError extends LoggableError {
	constructor(private message: string) {
		super();
	}

	public toString() {
		return formatDiagnostics([
			{
				category: ts.DiagnosticCategory.Error,
				code: (" roblox-ts" as unknown) as number,
				file: undefined,
				messageText: this.message,
				start: undefined,
				length: undefined,
			},
		]).replace(/TS roblox\-ts/g, "roblox-ts");
	}
}
