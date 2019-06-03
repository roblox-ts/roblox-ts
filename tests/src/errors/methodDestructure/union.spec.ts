function foo<T>(arr: Array<T> | { [key: number]: number }, index: number) {
	print(arr[index]);
}
