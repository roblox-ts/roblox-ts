declare function accept(callback: (this: defined) => number): void;

function forward(callback: () => number) {
	accept(callback);
}

forward((value?: number) => value ?? 42);
