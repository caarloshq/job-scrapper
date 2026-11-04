# Coletores do career-ops

Camada de providers proveniente de [career-ops](https://github.com/career-ops-hq/career-ops), licença MIT (LICENSE nesta pasta). A cópia original registra commit `2f7a0d7`, de 23/09/2026.

`providers/` e `user-agent.mjs` mantêm a licença original. O adaptador `../gringas.js` converte o formato e aplica os critérios locais. Não há sincronização automática com upstream.

SmartRecruiters é atendido por `../ats.js`; o provider upstream que exige js-yaml não está incluído. Não há auditoria de rede implícita: testes offline verificam contratos, não disponibilidade atual dos portais.
