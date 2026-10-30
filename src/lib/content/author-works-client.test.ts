import test from "node:test";
import assert from "node:assert/strict";
import { createAuthorWorksClient } from "./author-works";

test("作者请求合并在途请求、短缓存、写后失效，旧请求不能复活缓存", async () => {
  let calls = 0;
  let finish!: (value: Response) => void;
  const client = createAuthorWorksClient(async () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const params = {userId:"u"};
  const a = client.fetch(params), b = client.fetch(params);
  assert.equal(calls, 1);
  client.invalidate();
  finish(Response.json({total:1}));
  await Promise.all([a,b]);
  const c = client.fetch(params);
  assert.equal(calls,2);
  finish(Response.json({total:2}));
  await c;
  assert.equal((await client.fetch(params)).total,2);
  assert.equal(calls,2);
  assert.equal(client.stats.hits,1);
});
test("不同视图客户端隔离缓存；失败可重试且错误不缓存", async () => {
  let calls=0;
  const request = async () => { calls++; return calls===1 ? Response.json({error:{message:"无权查看"}},{status:403}) : Response.json({total:0}); };
  const a=createAuthorWorksClient(request), b=createAuthorWorksClient(request);
  await assert.rejects(a.fetch({userId:"u"}),/无权查看/);
  await a.fetch({userId:"u"});
  await b.fetch({userId:"u"});
  assert.equal(calls,3);
});
