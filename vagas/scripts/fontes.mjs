// Mostra as capacidades e termos sem fazer requisição de coleta.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, palavras, perfil } from '../src/config.js';
import { perfilDeDesign } from '../src/fontes-registro.js';
const catalogo = JSON.parse(readFileSync(join(RAIZ, 'config/catalogo-fontes.json'), 'utf8'));
console.log(`Fontes disponíveis; cargo: ${perfil.cargo_alvo || 'a configurar'}`);
console.log(`Consultas: ${(palavras.consultas_estreitas || []).join(', ') || 'a configurar'}`);
for (const f of catalogo.fontes) {
  const aviso = f.nicho === 'design' && !perfilDeDesign(perfil, palavras) ? ' · nicho de design: fora da rodada deste perfil' : '';
  console.log(`${f.nome}: ${f.modo}${aviso}`);
}
console.log('Disponível não significa ativo ou validado ao vivo. Configure fontes-gringas, fontes-portais, fontes-importadas e empresas-ats. Indeed/Glassdoor importam dados existentes; não iniciam scraper pago.');
