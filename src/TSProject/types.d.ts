import ts from "typescript";

declare module "typescript" {
	interface SourceFile {
		identifierCount: number;
		identifiers: Map<string>;
	}
}
