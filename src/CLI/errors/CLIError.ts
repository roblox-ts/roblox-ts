import { LoggableError } from "../../errors/LoggableError";

export class CLIError extends LoggableError {
	log() {
		console.log(`CLI Error: ${this.message}`);
	}
}
