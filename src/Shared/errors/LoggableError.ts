import { LogService } from "Shared/classes/LogService";

export abstract class LoggableError {
	public abstract toString(): string;
	public log() {
		LogService.writeLine(this.toString());
	}
}
