import kleur from "kleur";
import { LoggableError } from "Shared/errors/LoggableError";

export class CLIError extends LoggableError {
	constructor(private message: string) {
		super();
	}

	public toString() {
		return kleur.red("CLI Error:") + " " + this.message;
	}
}
