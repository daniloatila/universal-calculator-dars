# Método de verificação desktop no Windows

[English](windows-method.md)

A comparação usa o pacote de revisão Windows x64 aprovado da versão 0.4.1 e o pacote hospedado da versão 0.5.0. O verificador confere repositório, workflow, commit, branch, job Windows, digest do arquivo, manifesto, identidade do executável e inventário WASM antes de iniciar o candidato. Use o SHA-256 do executável 0.4.1 preservado no [recibo aprovado](../../objective-04/revision-01/windows-artifact.json). Os pacotes de revisão preservam as políticas do Windows e usam perfis temporários independentes do WebView2.

```powershell
pwsh -NoProfile -File scripts/verify-science-windows-artifact.ps1 -ArtifactId $artifactId -RunId $runId -Commit $commit
node scripts/verify-desktop.mjs --objective-05 --exe $candidate
node scripts/verify-science-desktop.mjs $baseline $candidate $verifiedReceipt artifacts/objective-05/paired-desktop
node scripts/verify-finance-desktop.mjs --candidate-only $candidate $verifiedSha artifacts/objective-05/finance-offline.json 0.5.0
node scripts/verify-finance-comparison-v041.mjs $candidate $verifiedSha artifacts/objective-05/finance-comparison 0.5.0
```

O teste histórico executa as 17 verificações de interação desktop existentes. O script pareado roda os dois executáveis em sequência no mesmo dispositivo, parte de perfis WebView2 novos e repete as mesmas expressões do Standard. Ele registra inicialização visível, primeiro resultado conferido, repouso visível, minimização, restauração e liberação após fechar. O candidato também testa sete exemplos científicos com a emulação de rede do WebView2, repete Graph Lab e Data Lab por três ciclos, confirma os resultados e verifica o encerramento dos workers. Após as fases cronometradas, lê os 22 arquivos WASM do aplicativo em execução e compara os bytes com os hashes do manifesto hospedado.

A primeira tentativa parou na referência 0.4.1 antes de iniciar o pacote 0.5.0. O worker do Standard havia voltado ao restaurar a janela e a contagem de eventos o tratou como worker científico remanescente. A tentativa corrigida distingue workers pela URL empacotada do módulo científico e preserva as contagens completas por fase e a verificação de encerramento da árvore de processos. A correção foi no teste, com os mesmos executáveis.

Os cinco exemplos financeiros offline e o cenário histórico de taxa equivalente foram executados em novas sessões do candidato, com evidência própria. O conjunto de referência 0.4.1 continua sendo a medição pareada da Standard. A captura de Probability foi refeita no mesmo candidato verificado após o desenho do primeiro gráfico. As medições originais continuam na execução pareada.

Working set, memória privada residente e commit privado vêm de contadores Win32 distintos. A árvore inclui o processo principal e os descendentes do WebView2. A soma da memória compartilhada residente pode contar uma página várias vezes. A variação da memória física do sistema inclui atividade externa ao aplicativo. O heap JavaScript é uma observação da renderização quando o WebView2 disponibiliza o contador. As repetições descrevem a carga medida e permitem observar dependências e recursos. A investigação prolongada de vazamento e a meta de RAM física atribuível ao aplicativo seguem o [protocolo da dívida de memória](../../objective-02/revision-02/memory-debt.pt-BR.md).
