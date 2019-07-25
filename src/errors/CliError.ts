import { red } from "../utility/text";
import { LoggableError } from "./LoggableError";

export class CliError extends LoggableError {
	public log() {
		console.log(red("CLI Error:"), this.message);
	}
}
