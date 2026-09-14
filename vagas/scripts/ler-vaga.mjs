// Despeja a descricao de vagas especificas do cache, para leitura.
//   node scripts/ler-vaga.mjs <chars> <id> [id...]
import { readFileSync } from 'node:fs';
const cache = JSON.parse(readFileSync('data/vagas.json','utf8'));
const vagas = cache.vagas || cache;
const n = Number(process.argv[2]) || 2000;
for (const id of process.argv.slice(3)) {
  const v = Array.isArray(vagas) ? vagas.find(x=>x.idExterno===id) : vagas[id];
  if (!v) { console.log(`### ${id} — NAO ENCONTRADA\n`); continue; }
  console.log(`### ${v.idExterno} | ${v.titulo} | ${v.empresa} | ${v.url || v.link}`);
  console.log(`salario=${JSON.stringify(v.salario)} modelo=${v.modelo||'?'} local=${v.cidade||v.local||'?'} publicada=${v.publicadaEm||'?'}`);
  console.log((v.descricao||'SEM DESCRICAO').slice(0,n));
  console.log('');
}
