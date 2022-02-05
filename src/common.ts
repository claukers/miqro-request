import { Console } from "console";
import { IncomingMessage, ClientRequest, IncomingHttpHeaders, OutgoingHttpHeaders } from "http";
import { URL, URLSearchParams } from "url";
import { newURL, newURLSearchParams } from "./helpers";

const mergeSearchParams = (search: URLSearchParams, append?: { [name: string]: string | string[] | number | boolean | number[] | boolean[] }): URLSearchParams => {
  const copy = newURLSearchParams(search.toString());
  if (!append) {
    return copy;
  }
  const keys = Object.keys(append);
  for (const k of keys) {
    if (append[k] instanceof Array) {
      for (const a of append[k] as Array<any>) {
        if (copy.has(k)) {
          copy.append(k, String(a));
        } else {
          copy.set(k, String(a));
        }

      }
    } else {
      if (copy.has(k)) {
        copy.append(k, String(append[k]));
      } else {
        copy.set(k, String(append[k]));
      }
    }
  }
  return copy;
};

export const readResponseBuffer = ({
  res,
  readTimeout,
  options,
  req,
  reject,
  logger
}: {
  res: IncomingMessage;
  readTimeout: NodeJS.Timeout | null,
  options: RequestOptions,
  req: ClientRequest,
  reject: (error: Error) => void;
  logger?: {
    error: (...args: any) => void;
  } | Console;
}, cb: (buffers: Buffer[]) => void): void => {
  try {
    const buffers: Buffer[] = [];

    if (readTimeout) {
      clearTimeout(readTimeout);
    }
    const responseTimeout = options.timeout ? setTimeout(() => {
      res.removeListener("data", chunkListener);
      res.removeListener("error", errorListener)
      res.removeListener("end", endListener);
      req.end(() => {
        try {
          req.destroy();
          res.destroy();
        } catch (e) {
          if (logger) {
            logger.error(e);
          }
        }
        reject(new Error(`response timeout ${options.timeout}`));
        return;
      });
    }, options.timeout) : null;

    let responseLength = 0;
    const chunkListener = (chunk: Buffer) => {
      responseLength += chunk.length;
      if (options.maxResponse && options.maxResponse < responseLength) {
        res.removeListener("data", chunkListener);
        res.removeListener("error", errorListener)
        res.removeListener("end", endListener);
        req.end(() => {
          try {
            req.destroy();
            res.destroy();
          } catch (e) {
            if (logger) {
              logger.error(e);
            }
          }
          reject(new Error(`response too big maxResponse ${options.maxResponse} < ${responseLength}`));
          return;
        });
      } else {
        buffers.push(chunk);
      }
    };
    const errorListener = (e2: Error) => {
      res.removeListener("data", chunkListener);
      res.removeListener("end", endListener);
      res.removeListener("error", errorListener);
      try {
        req.destroy();
        res.destroy();
      } catch (e) {
        if (logger) {
          logger.error(e);
        }
      }
      reject(e2);
    };

    const endListener = () => {
      try {
        if (responseTimeout) {
          clearTimeout(responseTimeout);
        }
        res.removeListener("data", chunkListener);
        res.removeListener("error", errorListener);
        cb(buffers);
      } catch (e: any) {
        reject(e);
      }
    };

    try {
      // setup listeners
      res.on("data", chunkListener);
      res.once("error", errorListener)
      res.once("end", endListener);
    } catch (e3: any) {
      // remove listeners
      res.removeListener("data", chunkListener);
      res.removeListener("end", endListener);
      res.removeListener("error", errorListener);
      reject(e3);
      return;
    }
  } catch (e: any) {
    reject(e);
    return;
  }
}

export const parseRedirectLocation = (url: string, extraQuery?: { [key: string]: string | string[] | number | boolean | number[] | boolean[] }, socketPath?: string): {
  protocol?: string;
  queryStr: string;
  pathname: string;
  hash: string;
  hostname?: string;
  socketPath?: string;
  port?: string;
  url: string;
} => {
  const ret = (urlO: URL, url: string, ignoreHostPort?: boolean) => {
    return {
      queryStr: mergeSearchParams(urlO.searchParams, extraQuery).toString(),
      protocol: ignoreHostPort ? "http:" : urlO.protocol,
      hash: urlO.hash,
      pathname: urlO.pathname,
      socketPath: ignoreHostPort ? socketPath : undefined,
      hostname: ignoreHostPort ? undefined : urlO.hostname,
      port: ignoreHostPort ? undefined : urlO.port,
      url: ignoreHostPort ? url : urlO.toString()
    };
  }
  try {
    return ret(newURL(url), url);
  } catch (eU) {
    if (url && url.length > 0 && url[0] === "/") {
      return ret(newURL(`http://localhost${url}`), url, true);
    } else {
      throw eU;
    }
  }
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


