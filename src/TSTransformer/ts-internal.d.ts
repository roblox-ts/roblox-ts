import ts from "byots";

declare module "byots" {
	interface Type {
		typeArguments?: Array<ts.Type>;
	}
}
