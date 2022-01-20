const { createServer } = require("http");
const { URL } = require("url");

const parseSearchParams = (search) => {
  const query = {};
  search.forEach((value, key) => {
    query[key] = query[key] instanceof Array ? (query[key]).concat([value]) : query[key] ? [query[key], value] : value;
  });
  return query;
};

module.exports.DummyApp = class DummyApp {
	constructor() {
		this.listeners = [];
	}
	get(path, cb) {
		this.listeners.push({
			path, cb, method: "get"
		});
	}
	post(path, cb) {
		this.listeners.push({
			path, cb, method: "post"
		});
	}
	listen(...args) {
		return createServer((req, res)=>{
			const url = new URL(req.url ? req.url : "/", `http://${req.headers.host}`);
			const end = ({status, headers, body}) => {
				return new Promise((resolve, reject) => {
			      try {
			        if (res.headersSent) {
			          reject(new Error("already ended"));
			        } else {
			          res.statusCode = status;
			          const keys = Object.keys(headers);
			          for (const key of keys) {
			            if (headers[key] !== undefined) {
			              res.setHeader(key, headers[key]);
			            }
			          }
			          res.end(body !== undefined ? String(body) : undefined, () => {
			            resolve();
			          });
			        }
			      } catch (e) {
			        reject(e);
			      }
			    });
			};
			const ctx = {
				url,
				path: url.pathname,
				req, res, headers: req.headers,
				logger: console,
				end,
				json: (body, headers, status) => {
					end({
				      status: status !== undefined ? status : 200,
				      headers: {
				        ['Content-Type']: 'application/json; charset=utf-8',
				        ...headers,
				      },
				      body: JSON.stringify(body)
				    });
				},
				text: (text, headers, status) => {
					end({
				      status: status !== undefined ? status : 200,
				      headers: {
				        ['Content-Type']: 'plain/text; charset=utf-8',
				        ...headers
				      },
				      body: text
				    });
				},
				redirect: (url, headers, status) => {
					return end({
				      status: status !== undefined ? status : 302,
				      headers: {
				        ['Location']: url,
				        ...headers
				      }
				    });
				},
				query: parseSearchParams(url.searchParams),
			};
			const readTimeout = setTimeout(() => {
	          clearTimeout(readTimeout);
	          ctx.req.removeListener('error', errorListener);
	          ctx.req.removeListener('data', chunkListener);
	          ctx.req.removeListener('end', endListener);
	          ctx.close();
	          return;
	        }, 100000);
	        let cLength = 0;
	        const buffers = [];
	        const endListener = async () => {
	          clearTimeout(readTimeout);
	          ctx.req.removeListener('error', errorListener);
	          ctx.req.removeListener('data', chunkListener);
	          ctx.req.removeListener('end', endListener);
	          try {
	            const concatBuffers = Buffer.concat(buffers);
	            const responseBuffer = ctx.headers["content-encoding"] === "gzip" ?
	              gunzipSync(concatBuffers) : concatBuffers;
	            ctx.buffer = responseBuffer;
	            
	            try {
	            	ctx.body = JSON.parse(ctx.buffer.toString());
	            } catch(e) {
					ctx.body = ctx.buffer.toString();
	            }
				
				for (const l of this.listeners) {
					if(l.path === url.pathname && req.method.toLowerCase() === l.method) {
						await l.cb(ctx);
						break;
					}
				}
	          } catch (e) {
	            console.error(e);
	          }
	        };
	        const errorListener = (err) => {
	          clearTimeout(readTimeout);
	          ctx.req.removeListener('error', errorListener);
	          ctx.req.removeListener('data', chunkListener);
	          ctx.req.removeListener('end', endListener);
	          reject(err);
	        };
	        const chunkListener = (chunk) => {
	          cLength += chunk.length;
	          buffers.push(chunk);
	        };
	        ctx.req.on('error', errorListener);
	        ctx.req.on('data', chunkListener);
	        ctx.req.on('end', endListener);
		}).listen(...args);
	}
}