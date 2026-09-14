// Ponte da camada 2 para a camada 1: a URL entrega o id, entao o dedupe
// contra a coleta por API e exato e nao por similaridade de texto.
//
// O Gupy tem duas formas de URL:
//   localiza.gupy.io/jobs/11130005                     -> id direto
//   fcamara.gupy.io/job/eyJqb2JJZCI6OTU1NjkwMSwi...    -> base64 de {"jobId":9556901,...}

/** @returns {{fonte: string, idExterno: string, empresa: string|null}|null} */
export function extrair(url) {
  if (!url) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  const partes = u.pathname.split('/').filter(Boolean);

  if (host.endsWith('.gupy.io')) {
    const sub = host.replace('.gupy.io', '');
    if (partes[0] === 'jobs' && /^\d+$/.test(partes[1] || '')) {
      return { fonte: 'Gupy', idExterno: `gupy:${partes[1]}`, empresa: sub };
    }
    if (partes[0] === 'job' && partes[1]) {
      const id = deBase64(partes[1]);
      if (id) return { fonte: 'Gupy', idExterno: `gupy:${id}`, empresa: sub };
    }
    return null;
  }

  if (host.endsWith('.inhire.app')) {
    const uuid = partes.find(ehUuid);
    if (uuid) return { fonte: 'InHire', idExterno: `inhire:${uuid}`, empresa: host.replace('.inhire.app', '') };
    return null;
  }

  if (host === 'jobs.ashbyhq.com') {
    const uuid = partes.find(ehUuid);
    if (uuid) return { fonte: 'Ashby', idExterno: `ashby:${uuid}`, empresa: partes[0] || null };
    return null;
  }

  if (host === 'job-boards.greenhouse.io' || host === 'boards.greenhouse.io') {
    const i = partes.indexOf('jobs');
    if (i >= 0 && partes[i + 1]) return { fonte: 'Greenhouse', idExterno: `greenhouse:${partes[i + 1]}`, empresa: partes[0] || null };
    return null;
  }

  if (host === 'jobs.lever.co') {
    const uuid = partes.find(ehUuid);
    if (uuid) return { fonte: 'Lever', idExterno: `lever:${uuid}`, empresa: partes[0] || null };
    return null;
  }

  if (host === 'jobs.recrutei.com.br') {
    const vaga = partes[partes.indexOf('vacancy') + 1];
    if (vaga) return { fonte: 'Recrutei', idExterno: `recrutei:${String(vaga).split('-')[0]}`, empresa: partes[0] || null };
    return null;
  }

  return null;
}

export function deBase64(s) {
  try {
    const txt = Buffer.from(decodeURIComponent(s), 'base64').toString('utf8');
    const obj = JSON.parse(txt);
    return obj?.jobId ? String(obj.jobId) : null;
  } catch {
    return null;
  }
}

function ehUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
