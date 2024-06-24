type Helper = 1 extends number ? CFrameConstructor : typeof Map;
declare const x: Helper;
({}) instanceof x;
