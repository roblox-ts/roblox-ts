export {};

interface MyWow {
	callback: (a: number) => void;
}

class A implements MyWow {
	callback(a: number) {} // Note: TS does not actually infer `a`'s type from the `MyWow` definition
}
