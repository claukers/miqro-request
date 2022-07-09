const { existsSync, unlinkSync } = require("fs");
const { strictEqual } = require("assert");
const { request } = require("../dist");
const { DummyApp: App, JSONParser, TextParser } = require("./app");

const getLogger = (identifer) => {
  return console;
}

let server;
let serverPort;
const SOCKET_PATH = "/tmp/socket.2222";
const PORT = 6363;

describe("request func tests", () => {
  setTestTimeout(10000);
  before(async () => {

    if (existsSync(SOCKET_PATH))
      unlinkSync(SOCKET_PATH);
    const app = new App();
    const appPort = new App();
    const redirectNoHostHandler = async (ctx) => {
      ctx.redirect(`/hello?format=txt&otherQ=3`, undefined, 302);
    };
    const redirectWithDifferentHostHandler = async (ctx) => {
      ctx.redirect(`http://localhost:${PORT + 1}/hello?format=txt&otherQ=4`, undefined, 302);
    };
    const redirectHandler = async (ctx) => {
      ctx.redirect(`http://localhost:${PORT}/hello?format=txt&otherQ=2`, undefined, 302);
    }
    const sumhandler = async (ctx) => {
      strictEqual(ctx.body instanceof Array, true);
      let ret = 0;
      for (const r of ctx.body) {
        ret += r.val;
      }
      ctx.text(`${ret}`);
    };
    const helloHandler = async (ctx) => {
      const format = ctx.query.format;
      const otherQ = ctx.query.otherQ;

      if (ctx.method === "POST" && format === "json") {
        strictEqual(ctx.body.bla, 1);
      } else if (ctx.method === "POST" && format === "txt") {
        strictEqual(ctx.body, "blo");
      }

      if (otherQ !== "1" && otherQ !== "2" && otherQ !== "3" && otherQ !== "4") {
        ctx.text("not valid otherQ [" + ctx.query.otherQ + "]", {}, 503);
      } else {
        switch (format) {
          case "txt":
            if (otherQ !== "1") {
              ctx.text("hello2");
            } else {
              ctx.text("hello");
            }
            break;
          case "json":
            ctx.json({
              ble: 2
            });
            break;
          default:
            ctx.text("not valid format [" + ctx.query.format + "]", {}, 400);
        }
      }
    };
    app.get("/hello", helloHandler);
    appPort.post("/post/hello", helloHandler);
    appPort.post("/post/sum", sumhandler);
    appPort.post("/timeout", async (ctx) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          ctx.text("true");
          resolve();
        }, 3000);
      })
    });
    appPort.post("/readtimeout", async (ctx) => {
      return new Promise((resolve) => {
        //ctx.res.write("true");
        console.log("here2");
        setTimeout(async () => {
          try {
            console.log("here");
            await ctx.text("true");
          } catch (e) {
            console.dir(e);
            // ctx.logger.error(e);
          }
          console.log("here3");
          resolve();
        }, 3000);
      })
    });
    app.post("/post/hello", helloHandler);
    app.post("/put/hello", helloHandler);
    app.get("/redirect", redirectHandler);
    appPort.get("/hello", helloHandler);
    appPort.get("/400", async (ctx) => {
      ctx.end({
        headers: {
          ["Content-Type"]: "plain/text; charset=utf-8"
        },
        status: 400,
        body: "BAD REQUEST"
      });
    });
    appPort.get("/redirect400", async (ctx) => {
      ctx.logger.info("resdirect 400!!");
      ctx.redirect("/400");
      ctx.logger.info("resdirect 400 done!!");
    });
    appPort.get("/redirectLoop", async (ctx) => {
      ctx.redirect("/redirectLoop");
    });
    appPort.get("/redirectLoop2", async (ctx) => {
      ctx.redirect("/redirectNoHostHandler");
    });
    appPort.get("/redirectNoHostHandler", redirectNoHostHandler);
    appPort.get("/redirectWithDifferentHostHandler", redirectWithDifferentHostHandler);
    // appPort.use(require("compression")({ threshold: 0 }));
    appPort.get("/compressHello", helloHandler);
    server = await app.listen(SOCKET_PATH);
    serverPort = await appPort.listen(PORT);

  });
  after(async () => {
    return new Promise((resolve, reject) => {
      server.close(() => {
        serverPort.close(() => {
          resolve();
        });
      });
    });
  });




  it('max response ', async () => {

    try {
      await request({
        url: "http://localhost:6363/hello?format=txt&otherQ=1",
        method: "get",
        maxResponse: 2
      }, getLogger("test"));
      strictEqual(false, true);
    } catch (e) {
      strictEqual((e).message, "response too big maxResponse 2 < 5");
    }

  });

  it('simple get follow redirect', async () => {

    try {
      const { url, redirectedUrl, status, data } = await request({
        url: "/redirect",
        method: "get",
        socketPath: SOCKET_PATH,
        followRedirect: true
      }, getLogger("test"));
      strictEqual(status, 200);
      strictEqual(redirectedUrl, "http://localhost:6363/hello?format=txt&otherQ=2");
      strictEqual(url, "/redirect");
      strictEqual(data, "hello2");
    } catch (e) {
      console.error(e);
      throw e;
    }

  });

  it('simple get /hello?format=txt happy path', async () => {

    try {
      const { data, status, buffer, headers } = await request({
        url: "http://localhost:6363/hello?format=txt&otherQ=1",
        method: "get"
      });
      strictEqual(data, "hello");
      strictEqual(status, 200);
    } catch (e) {
      console.error(e);
      throw e;
    }


  });

  it('simple get /hello?format=txt happy path not using util', async () => {

    const { data, status } = await request({
      url: "http://localhost:6363/hello?format=txt&otherQ=1",
      method: "get"
    });
    strictEqual(data, "hello");
    strictEqual(status, 200);

  });

  it('simple get /hello?format=txt happy path not using util query from options', async () => {

    const { data, status } = await request({
      url: "http://localhost:6363/hello",
      query: {
        format: "txt",
        otherQ: 1
      },
      method: "get"
    });
    strictEqual(data, "hello");
    strictEqual(status, 200);

  });

  it('simple get /hello?format=txt happy path not using util query from options with hash', async () => {

    const { data, status } = await request({
      url: "http://localhost:6363/hello#hash1",
      query: {
        format: "txt",
        otherQ: 1
      },
      method: "get"
    });
    strictEqual(data, "hello");
    strictEqual(status, 200);

  });

  it('simple get /hello?format=txt happy path not using util query from options and url', async () => {

    const { data, status } = await request({
      url: "http://localhost:6363/hello?otherQ=1",
      query: {
        format: "txt"
      },
      method: "get"
    });
    strictEqual(data, "hello");
    strictEqual(status, 200);

  });

  it('simple get /hello?format=txt happy path not using util query from options and url and hash', async () => {

    const { data, status } = await request({
      url: "http://localhost:6363/hello?otherQ=1#hashs",
      query: {
        format: "txt"
      },
      method: "get"
    });
    strictEqual(data, "hello");
    strictEqual(status, 200);

  });

  it('cannot get with data', async () => {

    try {
      await request({
        url: "anyurl",
        method: "get",
        data: 1
      });
      strictEqual(false, true);
    } catch (e) {
      strictEqual((e).message, "cannot send data on method get");
    }

  });

  it('cannot get with bad url', async () => {

    try {
      await request({
        url: "/hey",
        method: "get"
      });
      strictEqual(false, true);
    } catch (e) {
      strictEqual((e).message, "Bad url /hey");
    }

  });

  it('simple post /hello happy path', async () => {

    const { data, status } = await request({
      url: "http://localhost:6363/post/hello?format=txt&otherQ=1",
      method: "POST",
      data: "blo"
    });
    strictEqual(data, "hello");
    strictEqual(status, 200);

  });

  it('simple post /post/sum happy path', async () => {

    const resp = await request({
      url: "http://localhost:6363/post/sum",
      method: "POST",
      data: [{ val: 1 }, { val: 2 }]
    });
    strictEqual(resp.data, "3");
    strictEqual(resp.status, 200);

  });

  it('simple post /post/sum happy path with utf-8', async () => {

    const resp = await request({
      url: "http://localhost:6363/post/sum",
      method: "POST",
      data: [{ val: 1, ñ: "ññññ" }, { val: 2 }]
    });
    strictEqual(resp.data, "3");
    strictEqual(resp.status, 200);

  });

  it('simple post /hello happy path over unix socket', async () => {

    const { data, status } = await request({
      url: "/post/hello?format=txt&otherQ=1",
      method: "POST",
      data: "blo",
      socketPath: SOCKET_PATH
    });
    strictEqual(data, "hello");
    strictEqual(status, 200);

  });

  it('simple get /hello?format=txt happy path over unixsocket url act as path', async () => {

    const { data, status } = await request({
      url: "/hello?format=txt&otherQ=1",
      socketPath: SOCKET_PATH,
      method: "get"
    });
    strictEqual(data, "hello");
    strictEqual(status, 200);

  });

  it('simple get /hello?format=json happy path', async () => {

    const { data, status } = await request({
      url: "http://localhost:6363/hello?format=json&otherQ=1",
      method: "get"
    });
    strictEqual(data.ble, 2);
    strictEqual(status, 200);

  });

  it('simple get /hello?format=json happy path maxResponse', async () => {

    const { data, status } = await request({
      url: "http://localhost:6363/hello?format=json&otherQ=1",
      method: "get",
      maxResponse: 9,
    });
    strictEqual(data.ble, 2);
    strictEqual(status, 200);

  });

  it('simple get /hello?format=json happy path maxResponse too big', async () => {
    try {
      await request({
        url: "http://localhost:6363/hello?format=json&otherQ=1",
        method: "get",
        maxResponse: 8,
      });
      strictEqual(false, true);
    } catch (e) {
      strictEqual((e).message, "response too big maxResponse 8 < 9");
    }
  });

  it('simple get /hello?format=json happy path over unixsocket', async () => {

    const { data, status } = await request({
      url: "/hello?format=json&otherQ=1",
      socketPath: SOCKET_PATH,
      method: "get"
    });
    strictEqual(data.ble, 2);
    strictEqual(status, 200);

  });

  it('simple get /hello?format=txt happy path over unixsocket', async () => {

    try {
      const { data, status, redirectedUrl, locations } = await request({
        url: "/hello?format=txt&otherQ=1",
        socketPath: SOCKET_PATH,
        method: "get"
      });
      strictEqual(data, "hello");
      strictEqual(status, 200);
      strictEqual(redirectedUrl, null);
    } catch (e) {
      throw e;
    }

  });

  it('simple get /hello?format=notvalid happy path 400 throws over unixsocket', async () => {

    try {
      await request({
        url: "/hello?format=notvalid&otherQ=1",
        socketPath: SOCKET_PATH,
        method: "get"
      });
      strictEqual(true, false);
    } catch (e) {
      const { redirectedUrl, data, status, name } = e;
      strictEqual(name, "ResponseError");
      strictEqual(data, "not valid format [notvalid]");
      strictEqual(status, 400);
      strictEqual(redirectedUrl, null);
    }

  });
  ;

  it('simple get /hello?format=notvalid happy path 400 throws over unixsocket disableThrow', async () => {

    const e = await request({
      url: "/hello?format=notvalid&otherQ=1",
      socketPath: SOCKET_PATH,
      method: "get",
      disableThrow: true
    });
    const { redirectedUrl, data, status } = e;
    strictEqual(data, "not valid format [notvalid]");
    strictEqual(status, 400);
    strictEqual(redirectedUrl, null);

  });

  it('simple get follow redirect with different host and ECONNREFUSED', async () => {

    try {
      await request({
        url: "http://localhost:6363/redirectWithDifferentHostHandler",
        method: "get",
        followRedirect: true
      });
      strictEqual(true, false);
    } catch (e) {
      const { name, code, url, redirectedUrl, status, data } = e;
      strictEqual(code, "ECONNREFUSED");
      strictEqual(name, "ResponseConnectionRefusedError");
      strictEqual(redirectedUrl, "http://localhost:6364/hello?format=txt&otherQ=4");
      strictEqual(url, "http://localhost:6363/redirectWithDifferentHostHandler");
      strictEqual(status, undefined);
      strictEqual(data, undefined);
    }

  });

  it('simple get ignore redirects by default throws', async () => {

    try {
      await request({
        url: "/redirect",
        method: "get",
        socketPath: SOCKET_PATH
      });
      strictEqual(true, false);
    } catch ({ url, redirectedUrl, status, name }) {
      strictEqual(status, 302);
      strictEqual(name, "ResponseError");
      strictEqual(redirectedUrl, null);
      strictEqual(url, "/redirect");
    }


  });


  it('simple get follow redirect with no host', async () => {

    const { url, redirectedUrl, status, data, locations } = await request({
      url: "http://localhost:6363/redirectNoHostHandler",
      method: "get",
      followRedirect: true
    });
    strictEqual(status, 200);
    strictEqual(redirectedUrl, "http://localhost:6363/hello?format=txt&otherQ=3");
    strictEqual(locations[0], "http://localhost:6363/redirectNoHostHandler");
    strictEqual(locations[1], redirectedUrl);
    strictEqual(url, "http://localhost:6363/redirectNoHostHandler");
    strictEqual(data, "hello2");

  });


  it('simple get follow redirect 400', async () => {

    console.log("gads");
    try {
      await request({
        url: "http://localhost:6363/redirect400",
        method: "get",
        followRedirect: true
      }, getLogger("test"));
      strictEqual(true, false);
    } catch (e) {
      strictEqual((e).message, "request ended with status [400]");
      strictEqual((e).status, 400);
      strictEqual((e).locations[0], "http://localhost:6363/redirect400");
      strictEqual((e).locations[1], "http://localhost:6363/400");
      console.error(e);
    }

  });

  it('simple get follow redirect loop2', async () => {

    console.log("gads");
    const { url, redirectedUrl, status, data, locations } = await request({
      url: "http://localhost:6363/redirectLoop2",
      method: "get",
      followRedirect: true
    }, getLogger("test"));
    strictEqual(status, 200);
    strictEqual(redirectedUrl, "http://localhost:6363/hello?format=txt&otherQ=3");
    strictEqual(locations[0], "http://localhost:6363/redirectLoop2");
    strictEqual(locations[1], "http://localhost:6363/redirectNoHostHandler");
    strictEqual(locations[2], redirectedUrl);
    strictEqual(url, "http://localhost:6363/redirectLoop2");
    strictEqual(data, "hello2");

  });

  it('simple get follow redirect loop2 with max redirect 2', async () => {

    console.log("gads");
    const { url, redirectedUrl, status, data, locations } = await request({
      url: "http://localhost:6363/redirectLoop2",
      method: "get",
      followRedirect: true,
      maxRedirects: 2
    }, getLogger("test"));
    strictEqual(status, 200);
    strictEqual(redirectedUrl, "http://localhost:6363/hello?format=txt&otherQ=3");
    strictEqual(locations[0], "http://localhost:6363/redirectLoop2");
    strictEqual(locations[1], "http://localhost:6363/redirectNoHostHandler");
    strictEqual(locations[2], redirectedUrl);
    strictEqual(url, "http://localhost:6363/redirectLoop2");
    strictEqual(data, "hello2");

  });

  it('simple get follow redirect loop2 with max redirect 1', async () => {

    console.log("gads");
    try {
      await request({
        url: "http://localhost:6363/redirectLoop2",
        method: "get",
        followRedirect: true,
        maxRedirects: 1
      }, getLogger("test"));
      strictEqual(true, false);
    } catch (e) {
      strictEqual((e).message.indexOf("too many redirects to"), 0);
      console.error(e);
    }

  });

  it('simple get follow redirect max redirects', async () => {

    try {
      console.log("gads");
      const { url, redirectedUrl, status, data } = await request({
        url: "/redirect",
        method: "get",
        socketPath: SOCKET_PATH,
        followRedirect: true,
        maxRedirects: 1
      });
      strictEqual(status, 200);
      strictEqual(redirectedUrl, "http://localhost:6363/hello?format=txt&otherQ=2");
      strictEqual(url, "/redirect");
      strictEqual(data, "hello2");
    } catch (e) {
      console.error(e);
      throw e;
    }

  });

  it('simple get follow redirect max redirects fails', async () => {

    try {
      console.log("gads");
      const { url, redirectedUrl, status, data } = await request({
        url: "/redirect",
        method: "get",
        socketPath: SOCKET_PATH,
        followRedirect: true,
        maxRedirects: 0,
        disableThrow: true
      }, getLogger("test"));
      strictEqual(true, false);
    } catch (e) {
      strictEqual((e).message.indexOf("too many redirects to"), 0);
      console.error(e);
    }

  });

  it('simple get follow redirect loop', async () => {

    try {
      console.log("gads");
      const { url, redirectedUrl, status, data } = await request({
        url: "http://localhost:6363/redirectLoop",
        method: "get",
        followRedirect: true,
        disableThrow: true
      }, getLogger("test"));
      strictEqual(true, false);
    } catch (e) {
      strictEqual((e).message.indexOf("loop redirect to"), 0);
      console.error(e);
    }

  });

  it('timeout ', async () => {

    try {
      await request({
        url: "http://localhost:6363/timeout",
        method: "POST",
        timeout: 2000
      }, getLogger("test"));
      strictEqual(false, true);
    } catch (e) {
      strictEqual((e).message, "Response Timeout");
    }

  });

  it('readtimeout ', async () => {

    try {
      const ret = await request({
        url: "http://localhost:6363/readtimeout",
        method: "POST",
        timeout: 2000
      }, getLogger("test"));
      console.dir(ret);
      strictEqual(false, true);
    } catch (e) {
      console.dir(e);
      strictEqual((e).message, "Response Timeout");
    }

  });


});
