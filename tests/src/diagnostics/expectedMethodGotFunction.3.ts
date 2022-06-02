interface HasMethod {
	method(): void;
}

function method() {}

const obj: HasMethod = {
	method,
};
