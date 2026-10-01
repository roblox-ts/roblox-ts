declare function accept(callback: (this: defined) => number): void;

function callback(): number;
function callback(value?: number) {
	return value ?? 42;
}

accept(callback);
