declare function accept(callback: (this: defined) => number | undefined): void;

accept((value?: number) => value);
