import { ClientRequest, request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import {
  RequestOptions,
  RequestResponse,
  ResponseError
} from "./common.js";
import { CONTENT_TYPE_HEADER, JSON_TYPE, TEXT_TYPE, DEFAULT_USER_AGENT } from "./constants.js";
import { followRedirect, parseData, parseRedirectLocation, readResponseBuffer } from "./utils.js";
import { gunzipSync } from "zlib";
import { isBrowser } from "./helpers.js";

export function request(options: RequestOptions, logger?: {
  error: (...args: any) => void;
  debug: (...args: any) => void;
} | Console): Promise<RequestResponse> {
  if ((options.method && options.method.toLowerCase() === "get" || !options.method) && options.data !== undefined) {
    return Promise.reject(new Error("cannot send data on method get"));
  } else {
    return new Promise((resolve, reject) => {
      try {
        if (!options.headers) {
          options.headers = Object.create(null) as {};
        }
        if (typeof options.maxRedirects === "undefined") {
          options.maxRedirects = 10;
        }

        const contentType = options.headers[CONTENT_TYPE_HEADER] || options.headers[CONTENT_TYPE_HEADER.toLowerCase()] || undefined || options.headers[CONTENT_TYPE_HEADER.toUpperCase()];
        const isJSONType = contentType ? contentType.toString().toLocaleLowerCase().indexOf("application/json") === 0 : undefined;

        const noType = !contentType;
        const isBuffer: boolean = options.data instanceof Buffer;
        const isText: boolean = typeof options.data === "string";
        const JsonStringify: boolean = (!isBuffer && !isText && (noType || isJSONType as boolean));

        if (JsonStringify && noType) {
          options.headers["Content-Type"] = JSON_TYPE;
        } else if (isText && noType) {
          options.headers["Content-Type"] = TEXT_TYPE;
        }
        const data = options.data ? JsonStringify ? JSON.stringify(options.data) : options.data : undefined;
        const contentLength = data ? Buffer.from(data).length : 0;

        // { socketPath, protocol, queryStr, hash, pathname, hostname, port }
        const parsed = parseRedirectLocation(options.url, options.query, options.socketPath);

        if (!parsed.socketPath && !parsed.hostname) {
          throw new Error(`Bad url ${options.url}`);
        }

        delete options.headers["connection"];
        delete options.headers["keep-alive"];

        switch (parsed.protocol) {
          case "https:":
          case "http:":
            const readTimeout = options.timeout ? setTimeout(() => {
              try {
                req.end(() => {
                  try {
                    req.destroy();
                  } catch (e) {
                    if (logger) {
                      logger.error(e);
                    }
                  }
                  reject(new Error(`Response Timeout`));
                  return;
                });
              } catch (e) {
                reject(e);
              }
            }, options.timeout) : null;
            const req: ClientRequest = (parsed.protocol === "https:" ? httpsRequest : httpRequest)({
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
            }, function httpRequestListener(res) {
              (async () => {
                try {
                  if (readTimeout) {
                    clearTimeout(readTimeout);
                  }
                  const buffersP = readResponseBuffer({
                    res,
                    options,
                    logger
                  });
                  const responseBuffer: Buffer = res.headers["content-encoding"] === "gzip" && !isBrowser() ? gunzipSync(await buffersP) : await buffersP;
                  const contentType = res.headers["content-type"];
                  const data = parseData(contentType, responseBuffer);

                  const status = res.statusCode;
                  if (!status) {
                    const err = new ResponseError(status as any, res.headers, options.url, null, data, responseBuffer, options.locations ? options.locations : []);
                    reject(err);
                    return;
                  } else if (status >= 300 && status < 400 && options.followRedirect) {
                    // follow redirect
                    const location = res.headers["location"];
                    if (!location) {
                      reject(new Error(`[${location}] not valid from ${options.url}`));
                      return;
                    }
                    const ret = await followRedirect({
                      status, logger, location, options, parsed
                    });
                    resolve(ret);
                    return;
                  } else if (status >= 200 && status < 300) {
                    // always resolve with 2xx
                    resolve({
                      url: options.url,
                      status,
                      locations: options.locations ? options.locations : [],
                      redirectedUrl: null,
                      headers: res.headers,
                      data,
                      buffer: responseBuffer
                    });
                    return;
                  } else if (options.disableThrow && status !== undefined) {
                    // disable throw and resolve with 4xx 5xx etc
                    resolve({
                      url: options.url,
                      status,
                      locations: options.locations ? options.locations : [],
                      redirectedUrl: null,
                      headers: res.headers,
                      data,
                      buffer: responseBuffer
                    });
                  } else {
                    // throw with 4xx 5xx etc
                    const err = new ResponseError(status, res.headers, options.url, null, data, responseBuffer, options.locations ? options.locations : []);
                    reject(err);
                  }
                  return;
                } catch (e) {
                  reject(e);
                }
              })();

            });
            req.once("error", (e: Error) => {
              if ((e as any).code === "ECONNREFUSED") {
                e.name = "ResponseConnectionRefusedError";
              }
              reject(e);
            });
            req.end(data);
            break;
          default:
            reject(new Error(`unknown protocol [${parsed.protocol}]`))
        }
      } catch (e) {
        reject(e);
      }
    });
  }
}
