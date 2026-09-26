interface HasMethod {
	method(): void;
}

function method(value?: number) {}

const obj: HasMethod = {
	method,
};
