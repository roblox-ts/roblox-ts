import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";

export class RenderState {
	public indent = "";
	private scopeStack: Array<number> = [0];
	private seenTempNodes = new Map<lua.TemporaryIdentifier, string>();
	private readonly listNodesStack = new Array<lua.ListNode<lua.Statement>>();

	private pushIndent() {
		this.indent += "\t";
	}

	private popIndent() {
		this.indent = this.indent.substr(1);
	}

	public pushScope() {
		const top = this.scopeStack[this.scopeStack.length - 1];
		assert(top);
		this.scopeStack.push(top);
	}

	public popScope() {
		this.scopeStack.pop();
	}

	public getTempName(node: lua.TemporaryIdentifier) {
		return getOrSetDefault(this.seenTempNodes, node, () => `_${this.scopeStack[this.scopeStack.length - 1]++}`);
	}

	public pushListNode(listNode: lua.ListNode<lua.Statement>) {
		this.listNodesStack.push(listNode);
	}

	public peekListNode(): lua.ListNode<lua.Statement> | undefined {
		return this.listNodesStack[this.listNodesStack.length - 1];
	}

	public popListNode() {
		return this.listNodesStack.pop();
	}

	public block<T>(callback: () => T) {
		this.pushIndent();
		const result = callback();
		this.popIndent();
		return result;
	}

	public scope<T>(callback: () => T) {
		this.pushScope();
		const result = this.block(callback);
		this.popScope();
		return result;
	}
}
