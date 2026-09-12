import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeHttp } from '../src/lib/http.ts';
import type { Request } from '../src/types/types.ts';

function request(): Request {
  return { id:'draft',name:'Test',protocol:'rest',url:'https://example.com/echo?tag=one&tag=two',variables:[],creationTime:1,executionTime:null,
    http:{method:'GET',headers:[],query:[{id:'1',enabled:true,key:'tag',value:'one'},{id:'2',enabled:true,key:'tag',value:'two'}],queryInUrl:true,
      body:{type:'raw',content:'GET payload'},options:{insecure:false,redirect:true},request:null,response:null} };
}

test('GET bodies and duplicate query parameters reach the method bridge unchanged', async t => {
  let call: { url: string; init?: RequestInit } | undefined;
  t.mock.method(globalThis,'fetch',async (url: string,init?:RequestInit) => {
    call={url,init};
    return new Response('accepted',{headers:{'x-prism-status':'202 Accepted','content-type':'text/plain'}});
  });
  const result=await executeHttp(request(),new AbortController().signal,()=>{});
  assert.equal(call!.url,'/proxy/https/example.com/echo?tag=one&tag=two');
  assert.equal(call!.init!.method,'POST');
  assert.equal(new Headers(call!.init!.headers).get('x-prism-method'),'GET');
  assert.equal(call!.init!.body,'GET payload');
  assert.equal(result.http!.response!.statusCode,202);
  assert.equal(await result.http!.response!.body.text(),'accepted');
});

test('response cookies and HEAD content length are restored as inspectable metadata',async t=>{
  t.mock.method(globalThis,'fetch',async ()=>new Response(null,{headers:{'x-prism-status':'200 OK','x-prism-set-cookie':btoa(JSON.stringify(['a=1; HttpOnly','b=2'])),'x-prism-content-length':'999','access-control-allow-origin':'*'}}));
  const result=await executeHttp(request(),new AbortController().signal,()=>{});
  assert.equal(result.http!.response!.headers['set-cookie'],'a=1; HttpOnly\nb=2');
  assert.equal(result.http!.response!.headers['content-length'],'999');
  assert.equal(result.http!.response!.headers['access-control-allow-origin'],undefined);
});

test('stream content is published before the connection closes',async t=>{
  let source!:ReadableStreamDefaultController<Uint8Array>;
  const stream=new ReadableStream<Uint8Array>({start(controller){source=controller;}});
  t.mock.method(globalThis,'fetch',async ()=>new Response(stream,{headers:{'content-type':'text/event-stream'}}));
  let received!:()=>void;
  const partial=new Promise<void>(resolve=>{received=resolve;});
  let sawStreaming=false;
  const complete=executeHttp(request(),new AbortController().signal,response=>{
    if(response.http?.response?.body.size){sawStreaming=!!response.http.response.streaming;received();}
  });
  source.enqueue(new TextEncoder().encode('data: first\n\n'));
  await partial;
  assert.equal(sawStreaming,true);
  source.close();
  const result=await complete;
  assert.equal(result.http!.response!.streaming,false);
  assert.equal(await result.http!.response!.body.text(),'data: first\n\n');
});

test('missing binary files fail before any request is sent',async t=>{
  const fetch=t.mock.method(globalThis,'fetch',async ()=>new Response('unexpected'));
  const req=request(); req.http!.body={type:'binary',file:null,fileName:'missing.txt'};
  await assert.rejects(executeHttp(req,new AbortController().signal,()=>{}),/Reattach missing.txt/);
  assert.equal(fetch.mock.callCount(),0);
});
