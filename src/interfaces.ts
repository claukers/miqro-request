import { IncomingHttpHeaders, OutgoingHttpHeaders } from "http";

export type RequestLogger = {
  error: (...args: any) => void;
  debug: (...args: any) => void;
} | Console;

export interface ParsedRedirectLocation {
  protocol?: string;
  queryStr: string;
  pathname: string;
  hash: string;
  hostname?: string;
  socketPath?: string;
  port?: string;
  url: string;
}

export class ResponseError extends Error implements RequestResponse {
  /* eslint-disable  @typescript-eslint/explicit-module-boundary-types */
  constructor(
    public readonly status: number,
    public readonly headers: IncomingHttpHeaders,
    public readonly url: string,
    public readonly redirectedUrl: string | null,
    public readonly data: any,
    public readonly buffer: Buffer,
    public readonly locations: string[]
  ) {
    super(`request ended with ${status ? `status [${status}]` : "no status"}`);
    this.name = "ResponseError";
  }
}

export interface RequestOptions {
  url: string;
  method?: string;
  query?: { [key: string]: string | string[] | number | boolean | number[] | boolean[] };
  socketPath?: string;
  followRedirect?: boolean;
  disableUserAgent?: true;
  maxRedirects?: number;
  rejectUnauthorized?: boolean;
  maxResponse?: number;
  locations?: string[];
  timeout?: number;
  disableThrow?: boolean;
  headers?: OutgoingHttpHeaders;
  data?: any;
  signal?: AbortSignal;
}

export interface RequestResponse {
  url: string;
  redirectedUrl: string | null;
  locations: string[];
  headers: IncomingHttpHeaders,
  status: number;
  data: any;
  buffer: Buffer;
}


