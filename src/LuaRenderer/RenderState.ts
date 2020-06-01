import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { getEnding } from "LuaRenderer/util/getEnding";

const INDENT_CHARACTER = "\t";
const INDENT_CHARACTER_LENGTH = INDENT_CHARACTER.length;

/**
 * Represents the state of a rendering process.
 */
export class RenderState {
	private indent = "";
	private tempIdStack: Array<number> = [0];
	private localsStack: Array<number> = [0];
	private seenTempNodes = new Map<lua.TemporaryIdentifier, string>();
	private readonly listNodesStack = new Array<lua.ListNode<lua.Statement>>();

	public addLocals(amtLocals: number) {
		this.localsStack[this.localsStack.length - 1] += amtLocals;
	}

	public getLocals() {
		const top = this.localsStack[this.localsStack.length - 1];
		assert(top !== undefined);
		return top;
	}

	public pushLocalStack() {
		this.localsStack.push(0);
	}

	public popLocalStack() {
		this.localsStack.pop();
	}

	/**
	 * Pushes an indent to the current indent level.
	 */
	private pushIndent() {
		this.indent += INDENT_CHARACTER;
	}

	/**
	 * Pops an indent from the current indent level.
	 */
	private popIndent() {
		this.indent = this.indent.substr(INDENT_CHARACTER_LENGTH);
	}

	/**
	 * Pushes a new scope to scope stack.
	 */
	public pushScope() {
		const topTempId = this.tempIdStack[this.tempIdStack.length - 1];
		assert(topTempId !== undefined);
		this.tempIdStack.push(topTempId);
	}

	/**
	 * Pops the top of the scope stack.
	 */
	public popScope() {
		this.tempIdStack.pop();
	}

	/**
	 * Returns an unique identifier that is unused in the current scope.
	 * @param node The identifier of the node
	 */
	public getTempName(node: lua.TemporaryIdentifier) {
		return getOrSetDefault(this.seenTempNodes, node, () => `_${this.tempIdStack[this.tempIdStack.length - 1]++}`);
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
	 * Adds a newline to the end of the string.
	 * @param text The text.
	 */
	public newline(text: string) {
		return text + "\n";
	}

	/**
	 * Prefixes the text with the current indent.
	 * @param text The text.
	 */
	public indented(text: string) {
		return this.indent + text;
	}

	/**
	 * Renders a line, adding the current indent, a semicolon if necessary, and "\n".
	 * @param text The content of the line.
	 * @param endNode Node used to determine if a semicolon should be added. Undefined means no semi will be added.
	 */
	public line(text: string, endNode?: lua.Statement) {
		let result = this.indented(text);
		if (endNode) {
			result += getEnding(this, endNode);
		}
		result = this.newline(result);
		return result;
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
