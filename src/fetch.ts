import {CONTENT_TYPE_HEADER, JSON_TYPE, RequestOptions, RequestResponse, ResponseError, TEXT_TYPE} from "./common";
import {newURL} from "./helpers";

export async function request(args: RequestOptions, logger?: {
  error: (...args: any) => void;
  debug: (...args: any) => void;
} | Console): Promise<RequestResponse> {
  let url = args.url;
  /* eslint-disable  @typescript-eslint/ban-ts-comment */
  // @ts-ignore
  const headers = new Headers();
  const argHeaders = args.headers ? args.headers : Object.create(null);
  if (args.headers) {
    const names = Object.keys(args.headers);
    for (const name of names) {
      const value = args.headers[name];
      headers.set(name, value ? value.toString() : "");
    }
  }

  const requestContentType = argHeaders[CONTENT_TYPE_HEADER] || argHeaders[CONTENT_TYPE_HEADER.toLowerCase()] || undefined || argHeaders[CONTENT_TYPE_HEADER.toUpperCase()];
  const isJSONType = requestContentType ? requestContentType.toString().toLocaleLowerCase().indexOf("application/json") === 0 : undefined;

  const noType = !requestContentType;

  const isText: boolean = typeof args.data === "string";
  const isBuffer: boolean = args.data instanceof Buffer;
  const JsonStringify: boolean = (!isBuffer && !isText && (noType || isJSONType as boolean));

  if (JsonStringify && noType) {
    headers.set("Content-Type", JSON_TYPE);
  } else if (isText && noType) {
    headers.set("Content-Type", TEXT_TYPE)
  }
  args.data = args.data ? JsonStringify ? JSON.stringify(args.data) : args.data : undefined;

  if (args.query) {
    const urlO = newURL(args.url);
    const queryNames = Object.keys(args.query);
    for (const name of queryNames) {
      const value = args.query[name];
      if(value instanceof  Array) {
        for(const qV of value) {
          urlO.searchParams.append(name, qV as any);
        }
      } else {
        urlO.searchParams.append(name, value as any);
      }
    }
    url = urlO.toString();
  }

  /* eslint-disable  @typescript-eslint/ban-ts-comment */
  // @ts-ignore
  const response = await fetch(url, {
    headers,
    body: args.data,
    keepalive: false,
    method: args.method ? args.method : "GET",
    cache: "no-cache",
    redirect: args.followRedirect ? "follow" : "error",
    credentials: 'same-origin',
    mode: "cors",
    referrerPolicy: 'no-referrer'
  });

  const responseHeaders: any = {};
  response.headers.forEach((val: string, key: string) => {
    responseHeaders[val] = key;
  });

  const status = response.status;

  const buffer = await response.arrayBuffer() as any;
  let data;
  const contentType = response.headers.get("content-type");
  if (contentType && (contentType.indexOf("json") !== -1)) {
    /* eslint-disable  @typescript-eslint/ban-ts-comment */
    // @ts-ignore
    const decoder = new TextDecoder("utf-8");
    data = JSON.parse(decoder.decode(new Uint8Array(buffer)));
  } else if (contentType && (contentType.indexOf("text") !== -1)) {
    /* eslint-disable  @typescript-eslint/ban-ts-comment */
    // @ts-ignore
    const decoder = new TextDecoder("utf-8");
    data = decoder.decode(new Uint8Array(buffer));
  }

  if (!args.disableThrow && status < 200 && status > 300) {
    throw new ResponseError(status, responseHeaders, url, null, data, buffer, []);
  }

  const ret: RequestResponse = {
    url,
    status,
    locations: [],
    redirectedUrl: null,
    buffer: buffer as any,
    data,
    headers: responseHeaders
  };
  (ret as any).response = response;
  return ret;

}
