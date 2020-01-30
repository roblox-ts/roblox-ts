export abstract class LoggableError {
	/**
	 * A generic way of logging an error to stdout
	 * @param relativePathTo if provided, paths should be computed via `path.relative(relativePathTo, filePath)`
	 */
	public abstract log(relativePathTo?: string): void;
}
