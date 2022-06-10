const {existsSync, unlinkSync} = require("fs");
const {strictEqual} = require("assert");
const {request} = require("../dist");
const {DummyApp: App, JSONParser, TextParser} = require("./app");
const {fake} = require("@miqro/test");


describe("request func2 tests", () => {
  setTestTimeout(10000);


  let server;
  let postLogin = fake(() => {

  });
  const port = 9595;
  before(async () => {

    const serverApp = new App();
    serverApp.post("/api/login", async (ctx) => {
      ctx.logger.info("login hit with %o typeof %s", ctx.body, typeof ctx.body);
      postLogin(ctx.body);
      await ctx.json(ctx.body);
    });
    server = await serverApp.listen(9595);

    await (async function testServerApp() {
      const response = await request({
        url: `http://localhost:${port}/api/login`,
        method: "POST",
        data: {
          testUP: "1"
        }
      });
      strictEqual(response.status, 200);
    })();
    postLogin.reset();
  });
  after(async () => {
    await server.close();
  });

  it("happy path with buffer", async () => {
    const response = await request({
      url: "http://localhost:" + port + "/api/login",
      method: "POST",
      data: Buffer.from(JSON.stringify({userName: "hello", password: "world"}))
    });
    strictEqual(response.status, 200);
    strictEqual(postLogin.callArgs[0][0].userName, "hello");
  })
});
