export class Lazy<T> {
	private isInitialized = false;
	private value: T | undefined;

	constructor(private readonly getValue: () => T) {}

	public get() {
		if (!this.isInitialized) {
			this.isInitialized = true;
			this.value = this.getValue();
		}
		return this.value as T;
	}

	public set(value: T) {
		this.isInitialized = true;
		this.value = value;
	}
}
