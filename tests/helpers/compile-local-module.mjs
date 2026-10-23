import {readFile} from 'node:fs/promises';
import ts from 'typescript';
/** Offline TypeScript/JSON fixture graph; a new invocation has fresh server state. */
export async function compileLocalModule(file,overrides=new Map(),cache=new Map()){
 if(cache.has(file.href))return cache.get(file.href);
 const source=overrides.get(file.href)??await readFile(file,'utf8');
 let js=file.pathname.endsWith('.json')?'export default '+source:ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const match of [...js.matchAll(/from (['"])(\.[^'"]+)\1/g)]){
  const dep=new URL(match[2]+(/\.(ts|json)$/.test(match[2])?'':'.ts'),file);
  js=js.replace(match[0],`from ${JSON.stringify(await compileLocalModule(dep,overrides,cache))}`);
 }
 const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(file.href,url);return url;
}
