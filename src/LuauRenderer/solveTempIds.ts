import luau from "LuauAST";
import { RenderState } from "LuauRenderer";
import { visit } from "LuauRenderer/util/visit";
import { assert } from "Shared/util/assert";

function isScopeEdge(node: luau.Node, edge: "head" | "tail"): boolean {
	if (luau.isForStatement(node)) return true;
	if (luau.isNumericForStatement(node)) return true;
	if (luau.isFunctionLike(node)) return true;

	if (node.parent) {
		// is the first statement in a block that creates scope
		if (luau.hasStatements(node.parent)) {
			if (node === node.parent.statements[edge]?.value) {
				return true;
			}
		}

		// non-list elseBody would have the elseBody itself as a parent,
		// which would be a luau.IfStatement and handled above
		if (
			luau.isIfStatement(node.parent) &&
			luau.list.isList(node.parent.elseBody) &&
			node === node.parent.elseBody[edge]?.value
		) {
			return true;
		}
	}

	return false;
}

const isScopeStart = (node: luau.Node) => isScopeEdge(node, "head");
const isScopeEnd = (node: luau.Node) => isScopeEdge(node, "tail");

interface Scope {
	ids: Set<string>;
	lastTry: Map<string, number>;
}

export function solveTempIds(state: RenderState, ast: luau.List<luau.Statement>) {
	const tempIdsToProcess = new Array<luau.TemporaryIdentifier>();
	const nodesToScopes = new Map<luau.Node, Scope>();

	function createScope(parent?: Scope): Scope {
		return {
			ids: new Set(parent?.ids),
			lastTry: new Map(),
		};
	}

	const scopeStack = [createScope()];

	function pushScopeStack() {
		scopeStack.push(createScope(peekScopeStack()));
	}

	function popScopeStack() {
		return scopeStack.pop();
	}

	function peekScopeStack() {
		const scope = scopeStack[scopeStack.length - 1];
		assert(scope);
		return scope;
	}

	function registerId(name: string) {
		peekScopeStack().ids.add(name);
	}

	visit(ast, {
		before: node => {
			if (isScopeStart(node)) {
				pushScopeStack();
			}

			if (luau.isTemporaryIdentifier(node)) {
				nodesToScopes.set(node, peekScopeStack());
				tempIdsToProcess.push(node);
			} else if (luau.isVariableDeclaration(node)) {
				if (luau.list.isList(node.left)) {
					luau.list.forEach(node.left, node => {
						if (luau.isIdentifier(node)) {
							registerId(node.name);
						}
					});
				} else if (luau.isIdentifier(node.left)) {
					registerId(node.left.name);
				}
			} else if (luau.isFunctionLike(node)) {
				luau.list.forEach(node.parameters, node => {
					if (luau.isIdentifier(node)) {
						registerId(node.name);
					}
				});
			}
		},
		after: node => {
			if (isScopeEnd(node)) {
				popScopeStack();
			}
		},
	});

	for (const tempId of tempIdsToProcess) {
		if (state.seenTempNodes.get(tempId.id) === undefined) {
			const scope = nodesToScopes.get(tempId);
			assert(scope);
			let input = tempId.name ? `_${tempId.name}` : `_0`;
			const original = tempId.name ? input : "";
			let i = scope.lastTry.get(input) ?? 1;
			while (scope.ids.has(input)) {
				input = `${original}_${i++}`;
			}
			scope.lastTry.set(input, i);
			scope.ids.add(input);
			state.seenTempNodes.set(tempId.id, input);
		}
	}
}
