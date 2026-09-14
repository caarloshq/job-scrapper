// Gera os .md de instrucao das vagas de maior compatibilidade.
// NAO gera curriculo: so o rascunho para voce aprovar.
//
//   node scripts/instrucoes.mjs            # top 5 por compatibilidade
//   node scripts/instrucoes.mjs --min 80   # todas acima de 80%
//   node scripts/instrucoes.mjs --id inhire:xxx
import * as cache from '../src/cache.js';
import { escrever, baldesAcionados } from '../src/instrucao.js';
import { perfil } from '../src/config.js';
import { hidratar } from '../src/hidratar.js';

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : d;
};

// Recalcula em vez de confiar no que ficou congelado no cache. Regra R-003:
// vista derivada rele a fonte da verdade. Sem isto, registrar um julgamento
// nao mudava quem entra no corte ate a proxima coleta com rede.
const { ativas: todas } = hidratar(Object.values(cache.carregar().vagas));

const id = arg('--id', null);
// Sem --min explicito vale o corte do perfil. E decisao sua, entao
// mora em config e nao aqui.
const min = Number(arg('--min', perfil.curriculo?.gerar_instrucao_acima_de ?? 0));
const quantas = Number(arg('--top', 5));

let alvo;
if (id) {
  alvo = todas.filter((v) => v.idExterno === id);
  if (!alvo.length) {
    console.error(`Nao achei a vaga ${id} no cache.`);
    process.exit(1);
  }
} else {
  alvo = todas
    // Vaga concluida nao precisa de curriculo: ou ja foi aplicada, ou foi descartada.
    .filter((v) => !v.concluida)
    .filter((v) => (v.compatibilidade ?? 0) >= min)
    .sort((a, b) => (b.compatibilidade ?? 0) - (a.compatibilidade ?? 0))
    .slice(0, min ? undefined : quantas);
}

if (!alvo.length) {
  console.log('Nenhuma vaga atende ao critério. Rode a coleta primeiro, ou baixe o --min.');
  process.exit(0);
}

console.log(`\nGerando instrucao para ${alvo.length} vaga(s). Nenhum curriculo sera gerado.\n`);
for (const v of alvo) {
  const baldes = baldesAcionados(v);
  const p = escrever(v);
  const semantico = v.compatibilidade != null ? `${v.compatibilidade}%` : `${v.score?.determinado ?? '?'} det (sem semantico)`;
  console.log(`  ${String(semantico).padStart(22)}  ${String(v.empresa || '?').slice(0, 30).padEnd(30)}  ${baldes.length} balde(s): ${baldes.map((b) => b.id).join(', ') || 'nenhum'}`);
  console.log(`  ${' '.repeat(22)}  -> ${p.replace(process.env.HOME || '', '~')}`);
}
console.log('\nConfira os .md e me diga quais aprovar. So depois a skill adapt-resume roda.\n');
