class Example<T> {
	method(this: T, value: number) {
		return value + 1;
	}
}

const object = new Example<void>();
object.method(41);
