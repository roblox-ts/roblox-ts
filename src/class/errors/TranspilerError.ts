import * as ts from "ts-simple-ast";

export class TranspilerError extends Error {
	constructor(message: string, public readonly node: ts.Node) {
		super(message);
	}
}
