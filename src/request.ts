import {
  RequestLogger,
  RequestOptions,
  RequestResponse,
  ResponseError
} from "./interfaces.js";
import { asyncRequest, followRedirect, getRequestBody, parseData, parseRedirectLocation, readResponseBuffer } from "./utils.js";
import { gunzipSync } from "zlib";
import { isBrowser } from "./helpers.js";

export async function request(options: RequestOptions, logger?: RequestLogger): Promise<RequestResponse> {
  if ((options.method && options.method.toLowerCase() === "get" || !options.method) && options.data !== undefined) {
    return Promise.reject(new Error("cannot send data on method get"));
  } else {
    if (options.signal && options.signal.aborted) {
      throw new Error("aborted");
    }
    if (options.headers) {
      delete options.headers["connection"];
      delete options.headers["keep-alive"];
    }
    if (typeof options.maxRedirects === "undefined") {
      options.maxRedirects = 10;
    }
    // { socketPath, protocol, queryStr, hash, pathname, hostname, port }
    const parsed = parseRedirectLocation(options.url, options.query, options.socketPath);

    if (!parsed.socketPath && !parsed.hostname) {
      throw new Error(`Bad url ${options.url}`);
    }

    const { data, contentLength, headers: requestHeaders } = getRequestBody({
      data: options.data,
      headers: options.headers,
      maxRedirects: options.maxRedirects
    });

    switch (parsed.protocol) {
      case "https:":
      case "http:":
        const { req, res } = await asyncRequest({
          parsed,
          contentLength,
          logger,
          data,
          headers: requestHeaders,
          method: options.method,
          rejectUnauthorized: options.rejectUnauthorized,
          disableUserAgent: options.disableUserAgent,
          socketPath: options.socketPath,
          timeout: options.timeout
        });

        if (options.signal && options.signal.aborted) {
          throw new Error("aborted");
        }

        const readBuffersPromise = readResponseBuffer({
          res,
          maxResponse: options.maxResponse,
          timeout: options.timeout,
          logger
        });

        const responseBuffer: Buffer = res.headers["content-encoding"] === "gzip" && !isBrowser() ? gunzipSync(await readBuffersPromise) : await readBuffersPromise;
        const responseType = res.headers["content-type"];
        const responseData = parseData(responseType, responseBuffer);

        if (options.signal && options.signal.aborted) {
          throw new Error("aborted");
        }

        const responseStatus = res.statusCode;
        if (!responseStatus) {
          throw new ResponseError(responseStatus as any, res.headers, options.url, null, responseData, responseBuffer, options.locations ? options.locations : []);
        } else if (responseStatus >= 300 && responseStatus < 400 && options.followRedirect) {
          // follow redirect
          const location = res.headers["location"];
          if (!location) {
            throw new Error(`[${location}] not valid from ${options.url}`);
          }
          return await followRedirect({
            status: responseStatus, logger, location, options, parsed
          });
        } else if (responseStatus >= 200 && responseStatus < 300) {
          // always resolve with 2xx
          return {
            url: options.url,
            status: responseStatus,
            locations: options.locations ? options.locations : [],
            redirectedUrl: null,
            headers: res.headers,
            data: responseData,
            buffer: responseBuffer
          };
        } else if (options.disableThrow && responseStatus !== undefined) {
          // disable throw and resolve with 4xx 5xx etc
          return {
            url: options.url,
            status: responseStatus,
            locations: options.locations ? options.locations : [],
            redirectedUrl: null,
            headers: res.headers,
            data: responseData,
            buffer: responseBuffer
          };
        } else {
          // throw with 4xx 5xx etc
          throw new ResponseError(responseStatus, res.headers, options.url, null, responseData, responseBuffer, options.locations ? options.locations : []);
        }
      default:
        throw new Error(`unknown protocol [${parsed.protocol}]`);
    }
  }
}
