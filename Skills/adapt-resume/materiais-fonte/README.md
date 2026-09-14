# Materiais-fonte

O formulário de onboarding grava aqui dois PDFs, com nome fixo:

1. `curriculo.pdf`: seu currículo atual. Obrigatório.
2. `linkedin.pdf`: seu perfil do LinkedIn salvo como PDF ("Mais" → "Salvar como PDF"). Opcional.

Colocou à mão? Use os mesmos nomes e rode, dentro de `vagas/`:

```bash
npm run onboarding -- --extrair
```

Cada PDF vira `<nome>.extraido.txt`, que é o que o agente lê. Esta pasta inteira está no `.gitignore`, menos este README. Regra 1 do projeto vale aqui: nunca inventar. Cada frase do `base_content` tem que ser rastreável a um trecho destes materiais, ou a uma resposta sua na entrevista.
