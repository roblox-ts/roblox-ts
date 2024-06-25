function x<T extends number | string>(p: T extends number ? CFrameConstructor : typeof Map) {
	({}) instanceof p;
}
