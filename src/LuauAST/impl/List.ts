import * as luau from "LuauAST/bundle";
import { NoInfer } from "Shared/typeUtilities";
import { assert } from "Shared/util/assert";

const LIST_MARKER = Symbol("List");

export type ListNode<T extends luau.Node> = {
	prev?: luau.ListNode<T>;
	next?: luau.ListNode<T>;
	value: T;
};

export type List<T extends luau.Node> = {
	[LIST_MARKER]: true;
	head?: luau.ListNode<T>;
	tail?: luau.ListNode<T>;
	readonly: boolean;
};

export namespace list {
	// list creation functions

	export function makeNode<T extends luau.Node>(value: T): luau.ListNode<T> {
		return { value };
	}

	export function make<T extends luau.Node>(...values: Array<T>): luau.List<T> {
		if (values.length > 0) {
			const head = luau.list.makeNode(values[0]);
			let tail = head;
			for (let i = 1; i < values.length; i++) {
				const node = luau.list.makeNode(values[i]);
				tail.next = node;
				node.prev = tail;
				tail = node;
			}
			return { [LIST_MARKER]: true, head, tail, readonly: false };
		} else {
			return { [LIST_MARKER]: true, readonly: false };
		}
	}

	// type guard

	export function isList(value: unknown): value is luau.List<luau.Node> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return typeof value === "object" && (value as any)[LIST_MARKER] === true;
	}

	// list utility functions

	export function clone<T extends luau.Node>(list: luau.List<T>): luau.List<T> {
		const newList = luau.list.make<T>();
		luau.list.forEach(list, element => {
			luau.list.push(newList, { ...element });
		});
		return newList;
	}

	export function push<T extends luau.Node>(list: luau.List<T>, value: NoInfer<T>) {
		assert(!list.readonly);
		const node = luau.list.makeNode(value);
		if (list.tail) {
			list.tail.next = node;
			node.prev = list.tail;
		} else {
			list.head = node;
		}
		list.tail = node;
	}

	export function pushList<T extends luau.Node>(list: luau.List<T>, other: luau.List<T>) {
		assert(!list.readonly);
		assert(!other.readonly);
		other.readonly = true;

		if (other.head && other.tail) {
			if (list.head && list.tail) {
				list.tail.next = other.head;
				other.head.prev = list.tail;
				list.tail = other.tail;
			} else {
				list.head = other.head;
				list.tail = other.tail;
			}
		}
	}

	export function shift<T extends luau.Node>(list: luau.List<T>): T | undefined {
		assert(!list.readonly);
		if (list.head) {
			const head = list.head;
			if (head.next) {
				list.head = head.next;
				head.next.prev = undefined;
			} else {
				list.tail = undefined;
				list.head = undefined;
			}
			return head.value;
		}
	}

	export function unshift<T extends luau.Node>(list: luau.List<T>, value: NoInfer<T>) {
		assert(!list.readonly);
		const node = luau.list.makeNode(value);
		if (list.head) {
			list.head.prev = node;
			node.next = list.head;
		} else {
			list.tail = node;
		}
		list.head = node;
	}

	export function unshiftList<T extends luau.Node>(list: luau.List<T>, other: luau.List<T>) {
		assert(!list.readonly);
		assert(!other.readonly);
		other.readonly = true;

		if (other.head && other.tail) {
			if (list.head && list.tail) {
				list.head.prev = other.tail;
				other.tail.next = list.head;
				list.head = other.head;
			} else {
				list.head = other.head;
				list.tail = other.tail;
			}
		}
	}

	export function isEmpty<T extends luau.Node>(list: luau.List<T>) {
		return list.head === undefined;
	}

	export function isNonEmpty<T extends luau.Node>(list: luau.List<T>): list is Required<luau.List<T>> {
		return list.head !== undefined;
	}

	export function forEach<T extends luau.Node>(list: luau.List<T>, callback: (value: NoInfer<T>) => void) {
		let node = list.head;
		while (node) {
			callback(node.value);
			node = node.next;
		}
	}

	export function forEachListNode<T extends luau.Node>(
		list: luau.List<T>,
		callback: (value: luau.ListNode<T>) => void,
	) {
		let node = list.head;
		while (node) {
			callback(node);
			node = node.next;
		}
	}

	export function mapToArray<T extends luau.Node, U>(
		list: luau.List<T>,
		callback: (value: NoInfer<T>) => U,
	): Array<U> {
		const result = new Array<U>();
		luau.list.forEach(list, value => result.push(callback(value)));
		return result;
	}

	export function toArray<T extends luau.Node>(list: luau.List<T>): Array<T> {
		const result = new Array<T>();
		luau.list.forEach(list, value => result.push(value));
		return result;
	}

	export function every<T extends luau.Node>(list: luau.List<T>, callback: (value: NoInfer<T>) => boolean) {
		let node = list.head;
		while (node) {
			if (!callback(node.value)) {
				return false;
			}
			node = node.next;
		}
		return true;
	}

	export function some<T extends luau.Node>(list: luau.List<T>, callback: (value: NoInfer<T>) => boolean) {
		let node = list.head;
		while (node) {
			if (callback(node.value)) {
				return true;
			}
			node = node.next;
		}
		return false;
	}

	export function size<T extends luau.Node>(list: luau.List<T>) {
		let size = 0;
		let node = list.head;
		while (node) {
			size++;
			node = node.next;
		}
		return size;
	}
}
