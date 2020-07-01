import kleur from "kleur";
import { LogService } from "Shared/classes/LogService";

/**
 * Prints out a 'Compiler Warning' message.
 * @param message
 */
export function warn(message: string) {
	LogService.writeLine(`${kleur.yellow("Compiler Warning:")} ${message}`);
}
