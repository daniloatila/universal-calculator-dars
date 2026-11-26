# Verificação Windows do Data Lab 0.5.1

[English](windows-method.md)

A referência é o executável Windows x64 de revisão da 0.5.0 preservado. Confira seu SHA-256 no [recibo de proveniência da 0.5.0](../integrated-audit/windows-artifact.json). Antes de iniciar o candidato, confira o job Windows concluído no GitHub Actions, o commit, o digest do pacote, a identidade PE e o manifesto. Os scripts usam perfis temporários independentes do WebView2 e preservam a política de segurança do Windows.

```powershell
pwsh -NoProfile -File scripts/verify-science-windows-artifact.ps1 -ArtifactId $artifactId -RunId $runId -Commit $commit -Version 0.5.1
node scripts/verify-science-desktop.mjs $baseline $candidate $verifiedReceipt artifacts/objective-05/revision-01/paired-desktop
node scripts/verify-desktop.mjs --objective-05-revision-01 --exe $candidate
node scripts/verify-finance-desktop.mjs --candidate-only $candidate $verifiedSha artifacts/objective-05/revision-01/finance-offline.json 0.5.1
node scripts/verify-finance-comparison-v041.mjs $candidate $verifiedSha artifacts/objective-05/revision-01/finance-comparison 0.5.1
```

Os dois executáveis repetem as mesmas expressões da Standard no mesmo dispositivo. O ensaio observa início, repouso visível, minimização, restauração e encerramento da árvore de processos. O candidato executa sete exemplos científicos offline e repete Graph Lab e Data Lab em três ciclos. Em seguida, o script reinicia o Data Lab, importa o JSON misto comum com separador decimal de vírgula, tipa `valor` como decimal e confirma `n = 2`, soma exata `15/4` e média exata `15/8`. A prova exportada confirma a versão do motor, o digest da origem e o resultado observado. Após as fases cronometradas, o teste lê os 22 arquivos WASM empacotados pelo executável e confere os hashes dos bytes.

As 17 verificações históricas de desktop e as sessões financeiras offline do candidato têm conjuntos de evidência próprios. A comparação entre versões usa as fases equivalentes da Standard. Contadores de processo, observações de heap e capacidade WASM cobrem escopos distintos. O [protocolo da dívida de memória](../../objective-02/revision-02/memory-debt.pt-BR.md) segue como referência para a investigação prolongada e a meta de RAM física atribuível.
