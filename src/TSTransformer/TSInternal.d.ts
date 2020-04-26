import * as ts from "typescript";

declare module "typescript" {
	interface ConstructSignatureDeclaration {
		symbol: ts.Symbol;
	}

	interface VariableDeclaration {
		symbol: ts.Symbol;
	}
}
