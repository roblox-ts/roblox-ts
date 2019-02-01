declare function describe(phrase: string, callback: () => void): void;
declare function it(phrase: string, callback: () => void): void;
declare function itFOCUS(phrase: string, callback: () => void): void;
declare function itSKIP(phrase: string, callback: () => void): void;
declare function FOCUS(): void;
declare function SKIP(): void;

interface Be {
	near: (value: number, limit?: number) => void;
	a: (type: string) => void;
	ok: () => void;
}

interface To {
	equal: (value: any) => void;
	throw: () => void;
	be: Be;
}

interface Never {
	to: To;
}

declare function expect(
	value: any,
): {
	to: To;
	never: Never;
};
