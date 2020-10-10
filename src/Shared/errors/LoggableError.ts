import { LogService } from "Shared/classes/LogService";

export abstract class LoggableError {
	constructor() {
		debugger;
	}

	public abstract toString(): string;

	public log() {
		LogService.writeLine(this.toString());
	}
}
