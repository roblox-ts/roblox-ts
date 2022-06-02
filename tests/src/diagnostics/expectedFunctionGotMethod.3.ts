interface MyWow {
	callback: () => void;
}

class A implements MyWow {
	callback() {} // bad!
}
