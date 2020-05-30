import ts from "byots";
import { TransformState } from "TSTransformer";

export function getFirstConstructSymbol(state: TransformState, expression: ts.Expression) {
	const type = state.getType(expression);
	for (const declaration of type.symbol.declarations) {
		if (ts.isInterfaceDeclaration(declaration)) {
			for (const member of declaration.members) {
				if (ts.isConstructSignatureDeclaration(member)) {
					return member.symbol;
				}
			}
		}
	}
}
