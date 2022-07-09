import {
  RequestLogger,
  RequestOptions,
  RequestResponse,
  ResponseError
} from "./interfaces.js";
import { CONTENT_TYPE_HEADER, JSON_TYPE, TEXT_TYPE, DEFAULT_USER_AGENT } from "./constants.js";
import { asyncRequest, followRedirect, parseData, parseRedirectLocation, readResponseBuffer } from "./utils.js";
import { gunzipSync } from "zlib";
import { isBrowser } from "./helpers.js";

export async function request(options: RequestOptions, logger?: RequestLogger): Promise<RequestResponse> {
  if ((options.method && options.method.toLowerCase() === "get" || !options.method) && options.data !== undefined) {
    return Promise.reject(new Error("cannot send data on method get"));
  } else {
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
        const { req, res } = await asyncRequest({ parsed, options, contentLength, logger, data });

        const readBuffersPromise = readResponseBuffer({
          res,
          options,
          logger
        });
        const responseBuffer: Buffer = res.headers["content-encoding"] === "gzip" && !isBrowser() ? gunzipSync(await readBuffersPromise) : await readBuffersPromise;
        const responseType = res.headers["content-type"];
        const responseData = parseData(responseType, responseBuffer);


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
