# Comparação Windows da revisão 01 do Objetivo 02

[English](windows-audit-021.md) · [Evidências da revisão](../evidence/objective-02/revision-01/REPORT.md)

Use uma sessão interativa do Windows com as dependências de teste fixadas. Informe os três caminhos dos executáveis 0.1.1, 0.2.0 e 0.2.1, nessa ordem. O ensaio usa perfis WebView2 isolados, registra o hash de cada executável e verifica as mesmas expressões. A execução padrão segue 0.1.1, 0.2.0, 0.2.1, 0.2.1, 0.2.0, 0.1.1. Cada versão é aberta duas vezes e aparece em posições inversas. Mantenha a sessão aberta e deixe a janela em teste livre de interação.

```powershell
node benchmarks/windows-audit-021.mjs caminho-0.1.1.exe caminho-0.2.0.exe caminho-0.2.1.exe
```

As fases fixas de cada execução são ambiente com DARS fechado (3 s), estabilização após o primeiro resultado (8 s), cálculos repetidos (19 s), repouso visível (15 s), minimização por Win32 (14 s) e recuperação visível (13 s). Restaurar precisa recuperar e calcular o valor salvo. A mesma ferramenta Win32 do benchmark original fornece os contadores. Registram-se duração, amostras inválidas, estado de janela, atividade do sistema e total de processos. Heap e classificação de auxiliares são consultados no fim das fases. O modo `--quick` verifica o instrumento.

## Escopos de tempo

O ensaio principal preserva a automação completa. As etapas são preenchimento, clique normal do Playwright e espera do resultado conferido, medidos no processo externo. A medição publica p50, p95 e p99 por etapa. Um ensaio separado mede clique no DOM até o resultado, resultado até o quadro seguinte, cliques de localização normais e forçados, e solicitação ao worker até a resposta. A instrumentação temporária registra a inicialização do worker e a capacidade WASM quando informada. Renderização, commits React, execução do worker e agendamento podem se sobrepor. Uma diferença entre percentis de escopos distintos não identifica o tempo de uma camada.

O modo complementar `--diagnostic-only` faz 50 sondagens idênticas por executável e marca a chegada da resposta do worker, a mutação conferida no DOM e o próximo quadro no mesmo relógio do renderizador. O intervalo entre resposta e DOM inclui o processamento JavaScript, o agendamento do React e o commit observado. O quadro é uma referência temporal do renderizador. O modo não executa as fases pareadas de processos e informa quando a saída fica inalterada ou não tem resposta correspondente.

```powershell
node benchmarks/windows-audit-021.mjs caminho-0.1.1.exe caminho-0.2.0.exe caminho-0.2.1.exe --diagnostic-only
```

O exemplo Rust mede análise, cálculo e preparação da resposta tipada, além da serialização isolada de uma resposta já calculada. O formato estruturado também codifica o valor de sessão. O ensaio Node mede a chamada JS–WASM e o parse do JSON em intervalos separados. A execução de interface Windows é uma verificação própria.

```powershell
cargo run --locked --release -p dars-core --example audit_timings
node benchmarks/layers-audit-021.mjs caminho-wasm-0.1.1 caminho-wasm-0.2.0 caminho-wasm-0.2.1
```

## Memória e atribuição

A árvore distingue residência privada, memória privada comprometida, residência somada e compartilhamento. Separa o processo desktop dos auxiliares da WebView2. O serviço de depuração de teste permite classificar os auxiliares pelos IDs observados e indica quando a classificação não está disponível. Heap do renderizador e capacidade linear WASM têm escopos próprios. Mudanças podem refletir retenção de caches e do alocador. A diferença do sistema inclui atividade externa ao DARS. Mais ciclos prolongados ajudam a caracterizar a recuperação. [Definições dos contadores](windows-desktop.pt-BR.md)

Perfis e amostras brutas ficam na pasta de artefatos ignorada. Os agregados e hashes revisados são publicados na pasta de evidências. A reconstrução de um baseline é identificada quando o executável Windows difere em bytes.
