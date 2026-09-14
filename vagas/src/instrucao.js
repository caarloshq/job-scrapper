// Rascunho de adaptação. Gatilhos sugerem evidências; a descrição decide o desafio.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from './config.js';
import { normalizarTexto, casaTermo } from './util.js';

const mapa = JSON.parse(readFileSync(join(RAIZ, 'config', 'mapa-enfase.json'), 'utf8'));

/** Pasta da skill de curriculo, conforme a regra 5 do INSTRUCOES.md do projeto. */
export const DIR_ADAPT = join(RAIZ, '..', 'Skills', 'adapt-resume');
export const DIR_BUILDS = join(DIR_ADAPT, 'builds');

export function slug(empresa) {
  return normalizarTexto(empresa || 'empresa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'empresa';
}

/** Quais baldes de enfase a vaga acionou. Mecanico: le a descricao contra o mapa. */
export function baldesAcionados(vaga) {
  const corpo = `${vaga.titulo || ''} ${vaga.descricao || ''}`;
  return mapa.baldes
    .map((b) => ({ ...b, acertos: b.gatilhos.filter((g) => casaTermo(corpo, g)) }))
    .filter((b) => b.acertos.length > 0)
    .sort((a, b) => b.acertos.length - a.acertos.length);
}

/** Le o base_content de quem esta rodando. Nunca seu por padrao — do idioma pedido. */
export function carregarBaseContent(idioma = 'pt') {
  const p = join(DIR_ADAPT, `base_content_${idioma}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

/**
 * Para cada balde acionado, procura bullets marcados com aquele tema no
 * base_content da pessoa. Balde sem bullet correspondente e OMITIDO — nao
 * ha o que realcar, e a regra e nunca inventar.
 * @returns {Array<{id:string, acertos:string[], bullets:Array<{empresa:string, texto:string}>}>}
 */
export function realceDeBaldes(baldes, baseContent) {
  if (!baseContent) return baldes.map((b) => ({ ...b, bullets: [] }));
  return baldes.map((b) => {
    const bullets = [];
    for (const exp of baseContent.experience || []) {
      const temas = exp.bullets_temas || [];
      (exp.bullets || []).forEach((texto, i) => {
        // Trecho listado em `nunca_citar` (regex, no base_content) não entra
        // nem como sugestão de realce: é a pessoa dizendo o que não quer mais.
        const proibido = (baseContent.nunca_citar || []).some((re) => new RegExp(re).test(texto));
        if ((temas[i] || []).includes(b.id) && !proibido) bullets.push({ empresa: exp.company, texto });
      });
    }
    return { ...b, bullets };
  });
}

export function gerar(vaga, { idioma = 'pt', baseContent } = {}) {
  const dados = baseContent !== undefined ? baseContent : carregarBaseContent(idioma);
  const baldes = realceDeBaldes(baldesAcionados(vaga), dados);
  const s = slug(vaga.empresa);
  const pct = vaga.compatibilidade != null ? `${vaga.compatibilidade}/100` : 'sem semantico ainda';
  const base = `base_content_${idioma}.json`;
  const nome = dados?.name || 'Seu Nome';
  const cargoAtual = dados?.experience?.[0]?.role || 'Cargo';
  const numerosTravados = dados?.numeros_travados || [];
  const regrasExtra = dados?.regras_extra || [];

  const linhas = [];
  linhas.push(`# Instrução de adaptação — ${vaga.empresa || '?'}`);
  linhas.push('');
  linhas.push('> **Rascunho. Nenhum arquivo de currículo foi gerado.**');
  linhas.push('> A geração segue a autorização vigente da rodada. Sem autorização, confira a ênfase antes de rodar `adapt-resume`. Este arquivo não autoriza candidatura ou envio.');
  linhas.push('');
  linhas.push('## A vaga');
  linhas.push('');
  linhas.push(`| | |`);
  linhas.push(`|---|---|`);
  linhas.push(`| Cargo | ${vaga.titulo || '?'} |`);
  linhas.push(`| Empresa | ${vaga.empresa || '?'} |`);
  linhas.push(`| Prioridade de análise | **${pct}** |`);
  linhas.push(`| Janela | ${vaga.janelaRotulo || '?'} |`);
  linhas.push(`| Modelo | ${vaga.modelo || 'a confirmar'} |`);
  linhas.push(`| Salário | ${vaga.salarioTexto || '—'} |`);
  linhas.push(`| Fonte | ${vaga.fonte}${vaga.tambemVistoEm?.length ? ` (também em ${vaga.tambemVistoEm.join(', ')})` : ''} |`);
  linhas.push(`| Prazo | ${vaga.prazo ? String(vaga.prazo).slice(0, 10) : '—'} |`);
  linhas.push(`| Link | ${vaga.link || '?'} |`);
  linhas.push('');

  if (vaga.porQueCombina) {
    linhas.push('## Por que combina');
    linhas.push('');
    linhas.push(vaga.porQueCombina);
    linhas.push('');
  }
  if (vaga.gaps) {
    linhas.push('## Gaps');
    linhas.push('');
    linhas.push(vaga.gaps);
    linhas.push('');
  }

  const baldesComBullet = baldes.filter((b) => b.bullets.length > 0);
  linhas.push('## Decisão editorial obrigatória');
  linhas.push('Identificar o desafio central com trecho da descrição real; selecionar uma ou duas provas verificadas, com campo e fonte. Registrar ID/URL, idioma, descrição, decisões antes/depois e gaps em decisoes.json. Sem descrição suficiente, marcar pendente; não inferir pelo nome da empresa.');
  linhas.push('Gatilhos abaixo são candidatos de evidência. Não determinam ordem, nem comprovam experiência em produto de IA só porque há IA no processo de trabalho. Aplicar `nunca_citar` do base_content antes de reutilizar qualquer trecho legado.');
  linhas.push('## Evidências candidatas');
  linhas.push('');
  if (!baldesComBullet.length) {
    linhas.push('Nenhum gatilho do mapa achou bullet correspondente no seu currículo. **Não adaptar às cegas** — ler a vaga e decidir à mão, ou manter a base como está.');
    if (baldes.length) linhas.push(`(temas acionados na vaga sem bullet seu: ${baldes.map((b) => b.id).join(', ')})`);
  } else {
    linhas.push('Cada bullet listado já existe no seu `base_content`; nada aqui é novo. Baldes acionados na vaga sem bullet seu correspondente foram omitidos.');
    linhas.push('');
    for (const b of baldesComBullet) {
      linhas.push(`### ${b.id}  ·  gatilhos na vaga: ${b.acertos.map((a) => `\`${a}\``).join(', ')}`);
      linhas.push('');
      for (const bl of b.bullets) linhas.push(`- ${bl.empresa}: ${bl.texto}`);
      linhas.push('');
    }
    linhas.push('**Temas candidatos, sem ordem editorial automática:** ' + baldesComBullet.map((b) => b.id).join(' → '));
    linhas.push('');
  }

  linhas.push('## O que NÃO muda');
  linhas.push('');
  linhas.push('- Datas, empresas, cargos, formação e ordem das experiências e bullets. Certificações proibidas pelo perfil são removidas só na cópia; números proibidos não são reutilizados.');
  if (numerosTravados.length) linhas.push(`- Números travados: ${numerosTravados.join(' · ')}.`);
  for (const r of regrasExtra) linhas.push(`- ${r}`);
  linhas.push('- Os `base_content_*.json` **nunca** são sobrescritos.');
  linhas.push('');

  linhas.push('## Após conferir contexto e autorização, gerar e verificar');
  linhas.push('');
  linhas.push('```bash');
  linhas.push('cd "' + join(RAIZ, '..', 'Skills', 'adapt-resume') + '"');
  linhas.push(`cp ${base} builds/${s}/content.json    # cópia, a base fica intacta`);
  linhas.push(`# aplicar o plano de ênfase acima em builds/${s}/content.json`);
  linhas.push(`python3 generate_resume.py builds/${s}/content.json "../../Curriculo/${nome} - ${cargoAtual} - ${vaga.empresa || 'Empresa'}.pdf"`);
  linhas.push('```');
  linhas.push('');
  linhas.push('## Checklist antes de entregar');
  linhas.push('');
  linhas.push('- [ ] Desafio e uma ou duas provas rastreáveis; texto exato salvo; sem molde fixo nem resultado de equipe atribuído à pessoa');
  linhas.push('- [ ] Restrições do base_content aplicadas (nunca_citar e regras_extra); idioma no nível declarado, nunca elevado; executar verificar_resume.py com PDF e content.json');
  linhas.push('- [ ] Máximo 2 páginas');
  linhas.push('- [ ] `pdftotext` extrai o texto (selecionável, ATS-safe)');
  linhas.push('- [ ] Zero ocorrência de travessão');
  linhas.push('- [ ] Números conferem com a regra travada');
  linhas.push('- [ ] `git diff` vazio nos `base_content_*.json`');
  linhas.push('');
  linhas.push(`---`);
  linhas.push(`Gerado em ${new Date().toISOString().slice(0, 10)} · id \`${vaga.idExterno}\``);

  return linhas.join('\n') + '\n';
}

/** Escreve o .md na pasta de builds da skill. Nao toca em nada mais. */
export function escrever(vaga, opcoes) {
  const s = slug(vaga.empresa);
  const dir = join(DIR_BUILDS, s);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, 'instrucao.md');
  writeFileSync(p, gerar(vaga, opcoes));
  return p;
}

export function jaExiste(vaga) {
  return existsSync(join(DIR_BUILDS, slug(vaga.empresa), 'instrucao.md'));
}
