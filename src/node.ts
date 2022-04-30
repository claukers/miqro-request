import {ClientRequest, IncomingMessage, request as httpRequest} from "http";
import {request as httpsRequest} from "https";
import {
  parseRedirectLocation,
  RequestOptions,
  RequestResponse,
  ResponseError,
  readResponseBuffer,
  CONTENT_TYPE_HEADER, JSON_TYPE, TEXT_TYPE, DEFAULT_USER_AGENT
} from "./common";
import {gunzipSync} from "zlib";
import {isBrowser} from "./helpers";

export const request = (options: RequestOptions, logger?: {
  error: (...args: any) => void;
  debug: (...args: any) => void;
} | Console): Promise<RequestResponse> => {
  if ((options.method && options.method.toLowerCase() === "get" || !options.method) && options.data !== undefined) {
    return Promise.reject(new Error("cannot send data on method get"));
  } else {
    return new Promise((resolve, reject) => {
      try {
        if (!options.headers) {
          options.headers =Object.create(null) as {};
        }
        if (typeof options.maxRedirects === "undefined") {
          options.maxRedirects = 10;
        }

        const contentType = options.headers[CONTENT_TYPE_HEADER] || options.headers[CONTENT_TYPE_HEADER.toLowerCase()] || undefined || options.headers[CONTENT_TYPE_HEADER.toUpperCase()];
        const isJSONType = contentType ? contentType.toString().toLocaleLowerCase().indexOf("application/json") === 0 : undefined;

        const noType = !contentType;

        const isText: boolean = typeof options.data === "string";
        const JsonStringify: boolean = (!isText && (noType || isJSONType as boolean));

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
                  reject(new Error(`response timeout ${options.timeout}`));
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
            }, (res: IncomingMessage) => readResponseBuffer({
              options,
              req,
              readTimeout,
              logger,
              reject,
              res
            }, (buffers) => {
              try {
                const responseBuffer: Buffer = res.headers["content-encoding"] === "gzip" && !isBrowser() ?
                  gunzipSync(Buffer.concat(buffers)) : Buffer.concat(buffers);
                let data: any = responseBuffer.toString();

                const contentType = res.headers["content-type"];
                if (contentType && data && (contentType.indexOf("json") !== -1)) {
                  data = JSON.parse(responseBuffer.toString());
                }

                const status = res.statusCode;
                if (!status) {
                  const err = new ResponseError(status as any, res.headers, options.url, null, data, responseBuffer, options.locations ? options.locations : []);
                  reject(err);
                  return;
                } else if (status >= 300 && status < 400 && options.followRedirect) {
                  // follow redirect
                  const location = res.headers["location"];
                  try {
                    if (!location) {
                      reject(new Error(`[${location}] not valid from ${options.url}`));
                      return;
                    }
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
                      reject(new Error(`loop redirect to [${location}] from [${options.url}][${status}] locations ${options.locations ? options.locations.join(",") : "[]"}`));
                      return;
                    }

                    // append new location
                    options.locations = options.locations ? options.locations.concat([locationData.url]) : [options.url, locationData.url];

                    // check options.maxRedirects
                    if (options.maxRedirects !== undefined && (options.locations.length - 1) > options.maxRedirects) {
                      reject(new Error(`too many redirects to [${location}] from [${options.url}][${status}]`));
                      return;
                    }

                    // request new location pass current options
                    request({
                      ...options,
                      socketPath: locationData.socketPath,
                      url: locationData.url,
                      locations: options.locations
                    }, logger).then((ret) => {
                      resolve({
                        ...ret,
                        url: options.url,
                        redirectedUrl: ret.locations && ret.locations.length > 0 ? ret.locations[ret.locations.length - 1] : ret.url
                      });
                      return;
                    }).catch((e4: any) => {
                      // bad redirect
                      if (e4.url && e4.status && e4.headers && e4.data) {
                        const err = new ResponseError(e4.status, e4.headers, e4.url, e4.redirectedUrl, e4.data, e4.buffer, e4.locations ? e4.locations : (options.locations ? options.locations : []));
                        err.stack = e4.stack;
                        reject(err);
                        return;
                      } else {
                        (e4 as any).redirectedUrl = locationData.url;
                        (e4 as any).locations = options.locations;
                        (e4 as any).url = options.url;
                        reject(e4);
                        return;
                      }
                    });
                    return;
                  } catch (e5) {
                    reject(new ResponseError(status, res.headers, options.url, location ? location : null, data, responseBuffer, options.locations ? options.locations : []));
                    return;
                  }
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
                } else {
                  if (options.disableThrow && status !== undefined) {
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
                }
              } catch (e: any) {
                reject(e);
                return;
              }
            }))
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
