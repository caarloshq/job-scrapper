// Paridade entre checkouts: só leitura; nunca copia perfil ou credenciais.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { RAIZ } from '../src/config.js';
const ler = (root, path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const hash = s => createHash('sha256').update(s).digest('hex');
function conferir(root) {
  const cat = ler(root, 'config/catalogo-fontes.json');
  const ids = new Set();
  for (const f of cat.fontes) {
    if (ids.has(f.id)) throw new Error(`Fonte duplicada: ${f.id}`);
    ids.add(f.id);
    if (!existsSync(join(root, f.arquivo))) throw new Error(`Coletor ausente: ${f.id}`);
    if (f.config && !existsSync(join(root, f.config))) throw new Error(`Configuração ausente: ${f.id}`);
  }
  const registradas = ler(root, 'config/fontes-gringas.json').fontes;
  for (const f of registradas) if (!ids.has(f.provider)) throw new Error(`Provider fora do catálogo: ${f.provider}`);
  const compartilhados = ['src/fontes-registro.js','src/fontes/gringas.js','src/fontes/uxjobs.js','src/fontes/portais.js','src/fontes/importadas.js','src/fontes/ats.js','src/versao-git.js'];
  for (const f of readdirSync(join(root,'src/fontes/careerops/providers'))) compartilhados.push(`src/fontes/careerops/providers/${f}`);
  compartilhados.push('src/fontes/careerops/user-agent.mjs','src/fontes/careerops/LICENSE');
  return { catalogo: cat.fontes, providers: registradas.map(f => ({ provider: f.provider })).sort((a,b) => a.provider.localeCompare(b.provider)), hashes: Object.fromEntries([...new Set(compartilhados)].sort().map(p => [p, hash(readFileSync(join(root,p)))])) };
}
try {
  const atual = conferir(RAIZ);
  const i = process.argv.indexOf('--comparar');
  if (i >= 0) {
    if (!process.argv[i+1]) throw new Error('Informe a pasta vagas do outro checkout.');
    const outro = conferir(resolve(process.argv[i+1]));
    if (JSON.stringify(atual) !== JSON.stringify(outro)) throw new Error('Catálogo, capacidades ou código compartilhado divergem. Revise antes de publicar.');
    console.log(`Paridade confirmada: ${atual.catalogo.length} fontes e módulos compartilhados idênticos.`);
  } else console.log(`Catálogo íntegro: ${atual.catalogo.length} fontes. Para comparar: npm run verificar:fontes -- --comparar /caminho/outro/vagas`);
} catch (e) { console.error(e.message); process.exitCode = 1; }
