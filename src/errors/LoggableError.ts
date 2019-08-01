export abstract class LoggableError extends Error {
	public abstract log(projectPath: string): void;
}
