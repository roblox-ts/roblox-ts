import kleur from "kleur";

class Logger {
	constructor(private readonly writeStream: NodeJS.WriteStream) {}

	public verbose = false;
	private partial = false;

	write(message: string) {
		this.partial = !message.endsWith("\n");
		this.writeStream.write(message);
	}

	writeLine(...messages: Array<unknown>) {
		if (this.partial) {
			this.write("\n");
		}
		for (const message of messages) {
			this.write(message + "\n");
		}
	}
}

export class LogService {
	public static verbose = false;

	private static stdout = new Logger(process.stdout);
	private static stderr = new Logger(process.stderr);

	static write(message: string) {
		this.stdout.write(message);
	}

	static writeLine(...messages: Array<unknown>) {
		this.stdout.writeLine(...messages);
	}

	static writeLineIfVerbose(...messages: Array<unknown>) {
		if (this.verbose) {
			this.stdout.writeLine(...messages);
		}
	}

	static warn(message: string) {
		this.stdout.writeLine(`${kleur.yellow("Compiler Warning:")} ${message}`);
	}

	static fatal(message: string): never {
		this.stdout.writeLine(message);
		process.exit(1);
	}
}
