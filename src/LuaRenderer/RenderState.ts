import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";

export class RenderState {
	public indent = "";

	private pushIndent() {
		this.indent += "\t";
	}

	private popIndent() {
		this.indent = this.indent.substr(1);
	}

	public block<T>(callback: () => T) {
		this.pushIndent();
		const result = callback();
		this.popIndent();
		return result;
	}

	private scopeStack: Array<number> = [0];

	public pushScope() {
		this.scopeStack.push(this.peekScopeStackOrThrow());
	}

	public popScope() {
		this.scopeStack.pop();
	}

	private peekScopeStack() {
		return this.scopeStack[this.scopeStack.length - 1];
	}

	private peekScopeStackOrThrow() {
		const result = this.peekScopeStack();
		assert(result);
		return result;
	}

	public scope<T>(callback: () => T) {
		this.pushScope();
		const result = this.block(callback);
		this.popScope();
		return result;
	}

	private seenTempNodes = new Map<lua.TemporaryIdentifier, string>();

	public getTempName(node: lua.TemporaryIdentifier) {
		return getOrSetDefault(this.seenTempNodes, node, () => `_${this.scopeStack[this.scopeStack.length - 1]++}`);
	}

	private readonly listNodesStack = new Array<lua.ListNode<lua.Statement>>();

	public pushListNode(listNode: lua.ListNode<lua.Statement>) {
		this.listNodesStack.push(listNode);
	}

	public peekListNode(): lua.ListNode<lua.Statement> | undefined {
		return this.listNodesStack[this.listNodesStack.length - 1];
	}

	public popListNode() {
		return this.listNodesStack.pop();
	}
}
