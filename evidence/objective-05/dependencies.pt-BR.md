# Inventário das dependências científicas

[English](dependencies.md)

A regressão reutiliza nalgebra 0.35.0 e verifica posto e condicionamento antes de interpretar um ajuste. num-bigint, num-rational e num-traits fornecem operações exatas com limites no tamanho das entradas e dos intermediários. astro-float-num permanece nos motores que usam precisão configurável. statrs 0.18.0 entra sem recursos padrão, com funções de distribuição submetidas a comparações independentes. libm 0.2.16 fornece primitivas portáveis para amostragem reprodutível.

A avaliação de rand, rand_chacha e rand_distr levou ao uso de PCG32 versionado com semente explícita e ordem fixa de agregação. Para quantidades dimensionais, o reuso do Conversor mantém as unidades públicas e conversões SI já validadas. Por isso a implementação dispensa uom. Canvas atende às grades e curvas limitadas, com desenho sob demanda e câmera para 3D. Essa escolha dispensa Three.js, uPlot e contexto WebGL permanente.

O leitor csv 1.4.0 processa registros com aspas após decodificação explícita. A avaliação de calamine identificou uma representação numérica pública em ponto flutuante. O leitor de XLSX usa zip 9.8.2 com suporte restrito a stored/deflate e quick-xml 0.42.0 para preservar os números do XML. Ele verifica tamanhos, caminhos internos, profundidade, planilha e dimensões. sha2 0.10.9 fornece o SHA-256 do manifesto. [Representações de células](https://docs.rs/calamine/latest/calamine/enum.Data.html)

As versões e licenças individuais constam da tabela em inglês e dos manifests das crates. O Cargo.lock fixa também as dependências transitivas. Cargo audit e npm audit consultam as bases de avisos de segurança. Os tamanhos e tempos observados constam dos registros de medição. Python, NumPy, SciPy, SymPy e mpmath participam apenas da validação. [Manifesto Cargo](../../crates/dars-universal/Cargo.toml) · [Workflow de verificação](../../.github/workflows/ci.yml)
