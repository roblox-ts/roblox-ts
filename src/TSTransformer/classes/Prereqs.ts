import luau from "@roblox-ts/luau-ast";
import { valueToIdStr } from "TSTransformer/util/valueToIdStr";

export class Prereqs {
	public readonly statements = luau.list.make<luau.Statement>();

	/**
	 * Pushes a new prerequisite statement onto the list stack.
	 * @param statement
	 */
	public prereq(statement: luau.Statement) {
		luau.list.push(this.statements, statement);
	}

	/**
	 * Pushes a new prerequisite list of statement onto the list stack.
	 * @param statements
	 */
	public prereqList(statements: luau.List<luau.Statement>) {
		luau.list.pushList(this.statements, statements);
	}

	/**
	 * Declares and defines a new Luau variable. Pushes that new variable to a new luau.TemporaryIdentifier.
	 * Can also be used to initialise a new tempId without a value
	 * @param expression
	 */
	public pushToVar(expression: luau.Expression | undefined, name?: string) {
		const temp = luau.tempId(name || (expression && valueToIdStr(expression)));
		this.prereq(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: temp,
				right: expression,
			}),
		);
		return temp;
	}

	/**
	 * Uses `Prereqs.pushToVar(expression)` unless `luau.isSimple(expression)`
	 * @param expression the expression to push
	 */
	public pushToVarIfComplex<T extends luau.Expression>(
		expression: T,
		name?: string,
	): Extract<T, luau.SimpleTypes> | luau.TemporaryIdentifier {
		if (luau.isSimple(expression)) {
			return expression as Extract<T, luau.SimpleTypes>;
		}
		return this.pushToVar(expression, name);
	}

	/**
	 * Uses `Prereqs.pushToVar(expression)` unless `luau.isAnyIdentifier(expression)`
	 * @param expression the expression to push
	 */
	public pushToVarIfNonId<T extends luau.Expression>(expression: T, name?: string): luau.AnyIdentifier {
		if (luau.isAnyIdentifier(expression)) {
			return expression;
		}
		return this.pushToVar(expression, name);
	}
}
