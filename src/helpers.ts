export const newURL = (input: string, base?: string | any): any => {
  /* eslint-disable  @typescript-eslint/ban-ts-comment */
  // @ts-ignore
  return new URL(input, base)
}

export const newURLSearchParams = (arg?: string | any): any => {
  /* eslint-disable  @typescript-eslint/ban-ts-comment */
  // @ts-ignore
  return new URLSearchParams(arg);
}

export const isBrowser = (): boolean => {
  /* eslint-disable  @typescript-eslint/ban-ts-comment */
  // @ts-ignore
  return typeof window !== "undefined";
}
