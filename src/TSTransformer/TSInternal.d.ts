import * as ts from "typescript";

declare module "typescript" {
	interface ConstructSignatureDeclaration {
		symbol: ts.Symbol;
	}
}
