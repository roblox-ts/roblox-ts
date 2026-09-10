interface HasMethod {
	method(a: string): void;
}

function method(a: string) {}

const obj: HasMethod = {
	method,
};
