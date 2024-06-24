function x<T extends CFrameConstructor | typeof Map>(p: T) {
	({}) instanceof p;
}
