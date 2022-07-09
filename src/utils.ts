import { ClientRequest, IncomingMessage, request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { ParsedRedirectLocation, RequestLogger, RequestOptions, ResponseError } from "./interfaces.js";
import { DEFAULT_USER_AGENT } from "./constants.js";
import { newURL, newURLSearchParams } from "./helpers.js";
import { request } from "./request.js";

export interface AsyncRequestResult {
  req: ClientRequest;
  res: IncomingMessage
}

function asyncRequestErrorHandler(err: any): any {
  if (err.code === "ECONNREFUSED") {
    err.name = "ResponseConnectionRefusedError";
  }
  return err;
}

export async function asyncRequest({
  parsed,
  options,
  data,
  contentLength,
  logger
}: { data: any; parsed: ParsedRedirectLocation, options: RequestOptions, contentLength: number, logger?: RequestLogger }): Promise<AsyncRequestResult> {
  return new Promise<AsyncRequestResult>((resolve, reject) => {
    try {
      const readTimeout = options.timeout ? setTimeout(() => {
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
      }, options.timeout) : null;
      const httpRequestOptions = {
        agent: false,
        path: `${parsed.pathname}${parsed.queryStr ? `?${parsed.queryStr}` : ""}${parsed.hash ? parsed.hash : ""}`,
        method: options.method,
        rejectUnauthorized: options.rejectUnauthorized,
        socketPath: options.socketPath,
        headers: options.disableUserAgent ? {
          ["Content-Length"]: contentLength,
          ...options.headers
        } : {
          ["User-Agent"]: DEFAULT_USER_AGENT,
          ["Content-Length"]: contentLength,
          ...options.headers
        },
        timeout: options.timeout,
        hostname: parsed.hostname,
        port: parsed.port
      };

      const isHttps = parsed.protocol === "https:";
      logger?.debug("options [%o]", httpRequestOptions);
      logger?.debug("isHttps [%s]", isHttps);

      const httpModule = (isHttps ? httpsRequest : httpRequest);

      const req: ClientRequest = httpModule(httpRequestOptions, function httpRequestListener(res) {
        if (readTimeout) {
          clearTimeout(readTimeout);
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
  options,
  logger
}: {
  res: IncomingMessage;
  options: RequestOptions,
  logger?: RequestLogger
}): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const buffers: Buffer[] = [];

      const responseTimeout = options.timeout ? setTimeout(() => {
        res.removeListener("data", chunkListener);
        res.removeListener("error", errorListener)
        res.removeListener("end", endListener);
        reject(new Error("Response Timeout"));
      }, options.timeout) : null;

      let responseLength = 0;
      const chunkListener = (chunk: Buffer) => {
        responseLength += chunk.length;
        if (options.maxResponse && options.maxResponse < responseLength) {
          res.removeListener("data", chunkListener);
          res.removeListener("error", errorListener)
          res.removeListener("end", endListener);
          reject(new Error(`response too big maxResponse ${options.maxResponse} < ${responseLength}`));
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