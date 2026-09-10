// Minimal Node storage endpoint. Atomic temp-file renames prevent partial JSON writes.
import http from 'node:http';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PORT = process.env.PORT || 3001;
const storage = join(process.cwd(), 'storage');
const allowed = new Set(['base.json', 'notification.json', 'paywall.json', 'onboarding.json']);
const reply = (res, status, payload) => { res.writeHead(status, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify(payload)); };

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'}); return res.end(); }
  if (req.method !== 'POST' || req.url !== '/api/notifications') return reply(res, 404, {error:'Not found'});
  let body = ''; let aborted = false;
  req.on('data', chunk => { body += chunk; if (body.length > 1_000_000) { aborted = true; req.destroy(); } });
  req.on('end', async () => {
    try {
      if (aborted) throw new Error('Payload exceeds 1MB limit');
      const { files } = JSON.parse(body);
      if (!Array.isArray(files) || files.length !== 4 || files.some(file => !allowed.has(file.filename) || !file.content)) throw new Error('Expected the four approved JSON files');
      await mkdir(storage, {recursive:true});
      await Promise.all(files.map(async ({filename, content}) => {
        const finalPath = join(storage, filename), tempPath = `${finalPath}.${Date.now()}.tmp`;
        await writeFile(tempPath, JSON.stringify(content, null, 2), 'utf8');
        await rename(tempPath, finalPath);
      }));
      reply(res, 201, {saved: files.map(f => f.filename)});
    } catch (error) { reply(res, 400, {error:error.message}); }
  });
}).listen(PORT, () => console.log(`JSON storage server listening on http://localhost:${PORT}`));
