import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";

/**
 * Represents the state of a rendering process.
 */
export class RenderState {
	public indent = "";
	private scopeStack: Array<number> = [0];
	private seenTempNodes = new Map<lua.TemporaryIdentifier, string>();
	private readonly listNodesStack = new Array<lua.ListNode<lua.Statement>>();

	/**
	 * Pushes an indent to the current indent level.
	 */
	private pushIndent() {
		this.indent += "\t";
	}

	/**
	 * Pops an indent from the current indent level.
	 */
	private popIndent() {
		this.indent = this.indent.substr(1);
	}

	/**
	 * Pushes a new scope to scope stack.
	 */
	public pushScope() {
		const top = this.scopeStack[this.scopeStack.length - 1];
		assert(top !== undefined);
		this.scopeStack.push(top);
	}

	/**
	 * Pops the top of the scope stack.
	 */
	public popScope() {
		this.scopeStack.pop();
	}

	/**
	 * Returns an unique identifier that is unused in the current scope.
	 * @param node The identifier of the node
	 */
	public getTempName(node: lua.TemporaryIdentifier) {
		return getOrSetDefault(this.seenTempNodes, node, () => `_${this.scopeStack[this.scopeStack.length - 1]++}`);
	}

	/**
	 * Pushes a lua node to the top of the list node
	 * @param listNode The syntax node to add to the stop of the stack.
	 */
	public pushListNode(listNode: lua.ListNode<lua.Statement>) {
		this.listNodesStack.push(listNode);
	}

	/**
	 * Returns the top of the scope stack.
	 */
	public peekListNode(): lua.ListNode<lua.Statement> | undefined {
		return this.listNodesStack[this.listNodesStack.length - 1];
	}

	/**
	 * Pops the top list node off the syntax tree node stack.
	 */
	public popListNode() {
		return this.listNodesStack.pop();
	}

	/**
	 * Returns a rendered code block.
	 * @param callback The function used to render the block.
	 */
	public block<T>(callback: () => T) {
		this.pushIndent();
		const result = callback();
		this.popIndent();
		return result;
	}

	/**
	 * Returns a rendered scope.
	 * @param callback The function used to render the scopes body.
	 */
	public scope<T>(callback: () => T) {
		this.pushScope();
		const result = this.block(callback);
		this.popScope();
		return result;
	}
}
