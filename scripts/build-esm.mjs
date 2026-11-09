import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('dist/esm', {recursive:true});
await writeFile('dist/esm/package.json', JSON.stringify({type:'module'})+'\n');
