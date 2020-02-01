import "typescript";

declare module "typescript" {
	interface SourceFile {
		identifierCount: number;
		identifiers: Map<string>;
	}
}
