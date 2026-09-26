interface HasMethod {
	method(value: number): void;
}

const obj: HasMethod = {
	method: value => {},
};
