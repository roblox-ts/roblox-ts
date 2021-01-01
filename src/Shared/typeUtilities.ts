// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NoInfer<A extends any> = [A][A extends any ? 0 : never];
