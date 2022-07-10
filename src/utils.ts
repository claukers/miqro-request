import { ClientRequest, IncomingMessage, OutgoingHttpHeaders, request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { ParsedRedirectLocation, RequestLogger, RequestOptions, ResponseError } from "./interfaces.js";
import { CONTENT_TYPE_HEADER, DEFAULT_USER_AGENT, JSON_TYPE, TEXT_TYPE } from "./constants.js";
import { newURL, newURLSearchParams } from "./helpers.js";
import { request } from "./request.js";

export interface GetRequestDataArgs {
  headers?: OutgoingHttpHeaders;
  data?: any;
  maxRedirects?: number;
}

export function getRequestBody(options: GetRequestDataArgs): {
  data: any;
  headers: OutgoingHttpHeaders;
  contentLength: number;
} {
  const headers: OutgoingHttpHeaders = options.headers ? { ...options.headers } : Object.create(null) as {};

  const contentType = headers[CONTENT_TYPE_HEADER] || headers[CONTENT_TYPE_HEADER.toLowerCase()] || undefined || headers[CONTENT_TYPE_HEADER.toUpperCase()];
  const isJSONType = contentType ? contentType.toString().toLocaleLowerCase().indexOf("application/json") === 0 : undefined;

  const noType = !contentType;
  const isBuffer: boolean = options.data instanceof Buffer;
  const isText: boolean = typeof options.data === "string";
  const JsonStringify: boolean = (!isBuffer && !isText && (noType || isJSONType as boolean));

  if (JsonStringify && noType) {
    headers["Content-Type"] = JSON_TYPE;
  } else if (isText && noType) {
    headers["Content-Type"] = TEXT_TYPE;
  }
  const data = options.data ? JsonStringify ? JSON.stringify(options.data) : options.data : undefined;
  const contentLength = data ? Buffer.from(data).length : 0;

  return {
    data, contentLength,
    headers
  };
}

export interface AsyncRequestResult {
  req: ClientRequest;
  res: IncomingMessage
}

export interface AsyncRequestArgs {
  rejectUnauthorized?: boolean;
  method?: string;
  timeout?: number;
  signal?: AbortSignal;
  data: any;
  headers: OutgoingHttpHeaders;
  parsed: ParsedRedirectLocation;
  contentLength: number;
  socketPath?: string;
  disableUserAgent?: boolean;
  logger?: RequestLogger;
}

function asyncRequestErrorHandler(err: any): any {
  if (err.code === "ECONNREFUSED") {
    err.name = "ResponseConnectionRefusedError";
  }
  return err;
}

export async function asyncRequest({
  parsed,
  method,
  rejectUnauthorized,
  timeout,
  data,
  signal,
  headers,
  socketPath,
  disableUserAgent,
  contentLength,
  logger
}: AsyncRequestArgs): Promise<AsyncRequestResult> {
  if (signal?.aborted) {
    throw new Error("aborted");
  }
  return new Promise<AsyncRequestResult>((resolve, reject) => {
    try {
      const readTimeout = timeout ? setTimeout(() => {
        try {
          req.end(() => {
            try {
              req.destroy();
            } catch (e) {
              logger?.error(e);
            }
            reject(new Error(`Response Timeout`));
            return;
          });
        } catch (e) {
          reject(e);
        }
      }, timeout) : null;
      const httpRequestOptions = {
        agent: false,
        path: `${parsed.pathname}${parsed.queryStr ? `?${parsed.queryStr}` : ""}${parsed.hash ? parsed.hash : ""}`,
        method,
        rejectUnauthorized: rejectUnauthorized,
        socketPath,
        headers: disableUserAgent ? {
          ["Content-Length"]: contentLength,
          ...headers
        } : {
          ["User-Agent"]: DEFAULT_USER_AGENT,
          ["Content-Length"]: contentLength,
          ...headers
        },
        timeout,
        hostname: parsed.hostname,
        port: parsed.port
      };

      const isHttps = parsed.protocol === "https:";
      logger?.debug("options [%o]", httpRequestOptions);
      logger?.debug("isHttps [%s]", isHttps);

      const httpModule = (isHttps ? httpsRequest : httpRequest);

      if (signal?.aborted) {
        if (readTimeout) {
          clearTimeout(readTimeout);
        }
        throw new Error("aborted");
      }

      const req: ClientRequest = httpModule(httpRequestOptions, function httpRequestListener(res) {
        if (readTimeout) {
          clearTimeout(readTimeout);
        }
        if (signal?.aborted) {
          throw new Error("aborted");
        }
        resolve({
          res,
          req
        });
      });
      req.on("error", function (err: any) {
        reject(asyncRequestErrorHandler(err));
      });
      req.end(data);
      if (signal?.aborted) {
        if (readTimeout) {
          clearTimeout(readTimeout);
        }
        throw new Error("aborted");
      }
    } catch (e: any) {
      reject(asyncRequestErrorHandler(e));
    }
  });
}

export function parseRedirectLocation(url: string, extraQuery?: { [key: string]: string | string[] | number | boolean | number[] | boolean[] }, socketPath?: string): ParsedRedirectLocation {
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

export function mergeSearchParams(search: URLSearchParams, append?: { [name: string]: string | string[] | number | boolean | number[] | boolean[] }): URLSearchParams {
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

export async function followRedirect({ status, logger, location, options, parsed }: {
  location: string;
  status: number;
  parsed: ParsedRedirectLocation;
  options: RequestOptions,
  logger?: RequestLogger
}) {
  // parse location and add query data from current location
  const locationData = parseRedirectLocation(location, options.query, options.socketPath);

  // if no host is set in location header set the current header and protocol
  // protocol is infered from current location
  if (!locationData.hostname && parsed.hostname && !locationData.socketPath) {
    locationData.url = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${locationData.url}`;
  }

  if (logger) {
    logger.debug(`redirecting to [${locationData.url}] from [${options.url}][${status}]`);
  }

  // avoid loop redirect
  if (options.url === locationData.url || (options.locations && options.locations.indexOf(locationData.url) !== -1)) {
    throw new Error(`loop redirect to [${location}] from [${options.url}][${status}] locations ${options.locations ? options.locations.join(",") : "[]"}`);
  }

  // append new location
  options.locations = options.locations ? options.locations.concat([locationData.url]) : [options.url, locationData.url];

  // check options.maxRedirects
  if (options.maxRedirects !== undefined && (options.locations.length - 1) > options.maxRedirects) {
    throw new Error(`too many redirects to [${location}] from [${options.url}][${status}]`);
  }

  try {
    // request new location pass current options
    const ret = await request({
      ...options,
      socketPath: locationData.socketPath,
      url: locationData.url,
      locations: options.locations
    }, logger);
    return {
      ...ret,
      url: options.url,
      redirectedUrl: ret.locations && ret.locations.length > 0 ? ret.locations[ret.locations.length - 1] : ret.url
    };
  } catch (e4: any) {
    // bad redirect
    if (e4.url && e4.status && e4.headers && e4.data) {
      const err = new ResponseError(e4.status, e4.headers, e4.url, e4.redirectedUrl, e4.data, e4.buffer, e4.locations ? e4.locations : (options.locations ? options.locations : []));
      err.stack = e4.stack;
      throw err;
    } else {
      (e4 as any).redirectedUrl = locationData.url;
      (e4 as any).locations = options.locations;
      (e4 as any).url = options.url;
      throw e4;
    }
  }
}

export function parseData(contentType: string | undefined, responseBuffer: Buffer) {
  if (contentType && (contentType.indexOf("json") !== -1)) {
    return JSON.parse(responseBuffer.toString());
  } else if (contentType && (contentType.indexOf("text") !== -1)) {
    return responseBuffer.toString();
  } else {
    return responseBuffer;
  }
}

export async function readResponseBuffer({
  res,
  timeout,
  maxResponse,
  logger
}: {
  maxResponse?: number;
  timeout?: number;
  res: IncomingMessage;
  logger?: RequestLogger
}): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const buffers: Buffer[] = [];

      const responseTimeout = timeout ? setTimeout(() => {
        res.removeListener("data", chunkListener);
        res.removeListener("error", errorListener)
        res.removeListener("end", endListener);
        reject(new Error("Response Timeout"));
      }, timeout) : null;

      let responseLength = 0;
      const chunkListener = (chunk: Buffer) => {
        responseLength += chunk.length;
        if (maxResponse && maxResponse < responseLength) {
          res.removeListener("data", chunkListener);
          res.removeListener("error", errorListener)
          res.removeListener("end", endListener);
          reject(new Error(`response too big maxResponse ${maxResponse} < ${responseLength}`));
        } else {
          buffers.push(chunk);
        }
      };
      const errorListener = (e2: Error) => {
        res.removeListener("data", chunkListener);
        res.removeListener("end", endListener);
        res.removeListener("error", errorListener);
        reject(e2);
      };

      const endListener = () => {
        try {
          if (responseTimeout) {
            clearTimeout(responseTimeout);
          }
          res.removeListener("data", chunkListener);
          res.removeListener("error", errorListener);
          resolve(Buffer.concat(buffers));
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
  });
}