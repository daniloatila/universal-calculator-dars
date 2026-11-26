# Revisão do Formula Studio

[English](README.md) · [Guia de autoria e contribuição](../../../community/formulas/README.pt-BR.md)

O Formula Studio inclui quatro declarações locais. Cada execução registra o identificador da fórmula, a versão exata, a declaração completa, as entradas e unidades, os testes executados e a Calculation Proof do Rust. Fórmulas referenciadas preservam os próprios registros com versão fixada. O exemplo portátil usa vírgula decimal em português brasileiro, uma fração e a versão 1.0.0 da média aritmética. O Rust retornou exatamente 3/2. [Registro exportado](formula-run.json)

| Verificação | Resultado observado |
| --- | --- |
| Quatro declarações distribuídas | O executável Rust e o WASM coincidiram na área retangular de 12 m², nos juros simples de R$ 1.200, na média de 1/2 e na velocidade de 5/2 m/s. |
| Versões e dependências | A reprodução em uma biblioteca nova recuperou o registro integral. Uma segunda versão coexistiu com a primeira. A alteração de versão já ocupada falhou. A dependência preservou sua declaração e prova. |
| Validação e interrupção | Foram exercitados erros de unidade e domínio, referências ausentes, ciclos, expectativa incorreta, entradas excessivas, cancelamento e interrupção de gravação. A fórmula personalizada que falhou permaneceu fora da biblioteca. |
| Entrada localizada | Os sete idiomas produziram 42 trocas direcionadas no Chrome. Cada origem preservou integralmente o registro exportado em seus seis destinos. As 42 combinações mantiveram um único hash da prova matemática. |
| Importação e edição | O teste abriu o arquivo local, constatou falha no caso de teste, corrigiu a expectativa, verificou a fórmula, calculou, criou uma nova versão e duplicou a declaração. |

As seis suítes Node compararam integralmente respostas de êxito e erro dos alvos nativo e WASM do módulo Padrão. Oito testes de interface rodaram no Chrome instalado sobre a compilação 0.6.0. A captura mostra a interface em francês após a troca de uma entrada em português brasileiro. [Verificações](checks.json) · [42 casos de idioma](locale-matrix.json) · [Captura](formula-studio.png)

O validador independente de esquemas do PowerShell aceitou os quatro arquivos comunitários. Recusou três declarações modificadas com campo desconhecido, versão ausente e lista de testes vazia. [Validação do esquema](schema-validation.json)

## Reprodução

Compile o executável de linha de comando em release e gere o WASM pelo procedimento da CI. Após instalar as dependências web do arquivo de lock, execute na raiz do repositório.

```sh
node --experimental-strip-types --test apps/web/tests/formula-studio.test.mts
npm --prefix apps/web run test:e2e -- formula-studio.spec.ts
```

O verificador dimensional aceita unidades nomeadas compostas. Mudanças de escala ou de moeda exigem conversão explícita prévia. Resultados arredondados de dependências ficam impedidos de alimentar cálculos que exigem valor exato. Para resultado esperado aproximado, a tolerância deve comportar a diferença observada e a incerteza informada pelo motor. A biblioteca mantém até 64 versões e 512 KiB de declarações em memória. Uma declaração admite até 64 KiB e o registro de execução até 256 KiB. [Validação documental](../../../apps/web/src/formula-definition.ts) · [Testes da biblioteca](../../../apps/web/tests/formula-studio.test.mts)
