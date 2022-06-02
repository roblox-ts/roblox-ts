interface HasMethod {
	method: (this: HasMethod) => void;
}

const obj: HasMethod = {
	method: () => {},
};
