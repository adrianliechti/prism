import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queryFromUrl, urlWithQuery, normalizeRequest, missingAttachment } from '../src/lib/requestUtils.ts';
import { serializeRequest, deserializeRequest } from '../src/lib/data.ts';
import type { Request, RequestBody } from '../src/types/types.ts';

function request(body: RequestBody = { type: 'none' }): Request {
  return { id: 'draft', name: 'Example', protocol: 'rest', url: 'https://example.com/path', variables: [], creationTime: 1, executionTime: null,
    http: { method: 'POST', headers: [], query: [], queryInUrl: true, body, options: { insecure: false, redirect: true }, request: null, response: null } };
}

test('URL and table roundtrip preserves duplicate parameters and disabled values', () => {
  const pairs = queryFromUrl('https://example.com/?tag=one&tag=two&x=a%2Bb#hash');
  assert.deepEqual(pairs.filter(p => p.key).map(p => [p.key, p.value]), [['tag','one'],['tag','two'],['x','a+b']]);
  pairs[0].value = 'changed'; pairs[1].enabled = false;
  const url = urlWithQuery('https://example.com/?old=value#hash',pairs);
  assert.equal(url,'https://example.com/?tag=changed&x=a%2Bb#hash');
  const restored = queryFromUrl(url,pairs);
  assert.equal(restored.find(p => p.id === pairs[1].id)?.enabled,false);
  assert.equal(restored.filter(p => p.key==='tag' && p.enabled).length,1);
});

test('legacy URL and table parameters migrate once', () => {
  const draft = request();
  draft.url='https://example.com/?a=1';
  draft.http!.queryInUrl=undefined;
  draft.http!.query=[{id:'b',key:'b',value:'2',enabled:true}];
  const result=normalizeRequest(draft);
  assert.equal(result.url,'https://example.com/?a=1&b=2');
  assert.deepEqual(normalizeRequest(result),result);
});

test('variable markers remain editable in URL parameters', () => {
  const pairs=[{id:'v',enabled:true,key:'time',value:'{{timestamp:clock}}'}];
  assert.equal(urlWithQuery('https://example.com/',pairs),'https://example.com/?time={{timestamp:clock}}');
  assert.equal(queryFromUrl(urlWithQuery('https://example.com/',pairs))[0].value,pairs[0].value);
});

test('binary attachments and body format drafts survive serialization', async () => {
  const file=new File(['upload bytes'],'sample.txt',{type:'text/plain',lastModified:123});
  const draft=request({type:'binary',file,fileName:file.name});
  draft.http!.bodyDrafts={raw:{type:'raw',content:'keep this payload'},json:{type:'json',content:'{"keep":true}'}};
  const restored=deserializeRequest(JSON.parse(JSON.stringify(await serializeRequest(draft))));
  assert.equal(restored.http!.body.type,'binary');
  if (restored.http!.body.type!=='binary') throw new Error('wrong body');
  assert.equal(await restored.http!.body.file!.text(),'upload bytes');
  assert.equal(restored.http!.body.file!.lastModified,123);
  assert.deepEqual(restored.http!.bodyDrafts,draft.http!.bodyDrafts);
});

test('multipart files survive serialization and missing files block execution', async () => {
  const draft=request({type:'form-data',data:[{id:'f',key:'file',value:'',type:'file',enabled:true,file:new File(['data'],'test.txt'),fileName:'test.txt'}]});
  const restored=deserializeRequest(JSON.parse(JSON.stringify(await serializeRequest(draft))));
  assert.equal(missingAttachment(restored.http!.body),undefined);
  if(restored.http!.body.type!=='form-data') throw new Error('wrong body');
  assert.equal(await restored.http!.body.data[0].file!.text(),'data');
  restored.http!.body.data[0].file=null;
  assert.match(missingAttachment(restored.http!.body)!,/Reattach test.txt/);
  restored.http!.body.data[0].enabled=false;
  assert.equal(missingAttachment(restored.http!.body),undefined);
});

test('oversized attachments require reattachment after reload', async () => {
  const draft=request({type:'binary',file:new File([new Uint8Array(8*1024*1024+1)],'large.bin'),fileName:'large.bin'});
  const restored=deserializeRequest(await serializeRequest(draft));
  assert.match(missingAttachment(restored.http!.body)!,/Reattach large.bin/);
});

test('credentials are retained consistently for encrypted backend storage', async () => {
  const draft:Request={...request(),protocol:'openai',http:undefined,openai:{model:'test-model',apiKey:'synthetic-secret'}};
  const restored=deserializeRequest(await serializeRequest(draft));
  assert.equal(restored.openai?.apiKey,'synthetic-secret');
});
