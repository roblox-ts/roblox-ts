export abstract class LoggableError {
	public abstract toString(): string;
	public log() {
		console.log(this.toString());
	}
}
