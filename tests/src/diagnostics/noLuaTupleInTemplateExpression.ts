export {};

function a() {
	return [1, 2] as LuaTuple<[number, number]>
}

`${a()}`
