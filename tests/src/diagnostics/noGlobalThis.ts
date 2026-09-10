print(globalThis);

function withGlobalReceiver(this: typeof globalThis) {
	print(this);
}

const contextualReceiver: ThisType<typeof globalThis> & { method(): void } = {
	method() {
		this;
	},
};
