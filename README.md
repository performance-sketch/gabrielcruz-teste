# gabrielcruz-teste · área de testes

Cópia do [GABRIELCRUZ](https://github.com/performance-sketch/GABRIELCRUZ) (que não é alterado) com **receita bruta e líquida** e calculadora de taxas.

Link: https://performance-sketch.github.io/gabrielcruz-teste/

**Valores protegidos:** receita e pagamentos saem do arquivo aberto e vão criptografados (AES-256-GCM, chave PBKDF2-SHA256) em `REZDY_COFRE`. A aba Financeiro pede a senha (secret `SENHA_FINANCEIRO`). Sem a senha, o sync falha em vez de gravar valores em texto aberto.

---


Mesmas telas do [vertical-rio-hub](https://gabrielcruzverticalrio.github.io/vertical-rio-hub/), alimentadas pela API da Rezdy.

Páginas: `index.html`, `tv_sala_espera.html`, `tv_escritorio.html`, `ipad_operacao.html`, `central_avisos.html`, `hub_financeiro.html`.

## Como os dados chegam
`.github/workflows/sync-rezdy.yml` roda `scripts/sync_rezdy.py` a cada 15 min (07h–21h) e grava `assets/rezdy_dados.js`.
A chave fica no secret `REZDY_API_KEY`; nenhum nome, e-mail ou telefone de cliente é gravado. As TVs recarregam a cada 5 min.

- **Voo** = horário de saída com reservas ativas (produtos no mesmo horário viram um voo só).
- **Pax, reservas, order numbers, status da reserva, duração, capacidade/vagas** vêm da Rezdy.
- **Valores financeiros** (`INCLUIR_VALORES=1`): receita = dinheiro recebido por forma de pagamento (Stripe, PayPal, Rede, PIX, dinheiro, OTA), sem descontos/cortesias, menos estornos; taxas Stripe 4%, PayPal 3,4%, comissão GYG da Rezdy.

## O que NÃO vem da Rezdy
- Pulseira: rodízio automático PRETA, BRANCA, AMARELA, VERDE
- Código do voo (VR101…): gerado em ordem de horário
- Status operacional (check-in, briefing, embarque): pelo horário + iPad
- Clima
- Taxas de plataforma/cartão: % fixo estimado
- Horas voadas: estimadas pela duração do produto

Parâmetros: `?hora=HH:MM` simula outro horário.
