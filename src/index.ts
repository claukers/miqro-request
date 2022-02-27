import {RequestOptions, RequestResponse} from "./common";
import {isBrowser} from "./helpers";

export {RequestOptions, RequestResponse} from "./common";

export function request(options: RequestOptions, logger?: {
  error: (...args: any) => void;
  debug: (...args: any) => void;
} | Console): Promise<RequestResponse> {
  if (isBrowser()) {
    const {request} = require("./fetch");
    return request(options, logger);
  } else {
    // we use dynamic require to trick webpack into not bundle ./node.js
    const nodePath = "./node";
    const {request} = require(nodePath);
    return request(options, logger);
  }
}
