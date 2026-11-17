// Reescreve em linguagem técnica formal os textos digitados na oficina (recomendações, motivos de
// condenação e descrições do aditivo) para o laudo e a proposta da New Válvulas.
// A chave da Anthropic fica no segredo ANTHROPIC_API_KEY do projeto; nunca vai para o app.
import Anthropic from "npm:@anthropic-ai/sdk@1.9.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Limites para um laudo grande caber e ninguém usar o serviço para outra coisa.
const MAX_ITENS = 80, MAX_CHARS_ITEM = 600, MAX_CHARS_TOTAL = 20000;

const SYSTEM = `Você revisa textos de laudos técnicos de manutenção de válvulas industriais da New Válvulas (New Equipamentos), em português do Brasil.
Cada item é um texto curto digitado às pressas na oficina: recomendação para um componente não conforme, motivo da condenação de uma válvula, ou descrição de um serviço da proposta de aditivo.
Reescreva cada texto em linguagem técnica formal, impessoal e objetiva, adequada a um laudo entregue ao cliente:
- mantenha exatamente o sentido; não acrescente causas, medidas, materiais, normas, prazos ou serviços que não estejam no texto original;
- preserve números, materiais (ex.: AISI 420), siglas (LP, API) e nomes próprios;
- corrija ortografia, acentuação e concordância; nunca use caixa alta;
- use o componente e o destino informados para deixar a frase completa (ex.: "será preenchido com solda e usinado", componente Haste, destino recuperação -> "Recomenda-se a recuperação da haste por enchimento com solda e posterior usinagem.");
- recomendação e motivo: uma ou duas frases, terminadas em ponto. Descrição do aditivo: um título curto de serviço, sem ponto final;
- se o texto já estiver adequado, devolva-o com ajustes mínimos.
Devolva todos os itens recebidos, com o mesmo id.`;

const SCHEMA = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, texto: { type: "string" } },
        required: ["id", "texto"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
};

type Item = { id: string; campo: string; texto: string; componente?: string; destino?: string; valvula?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "use POST" });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json(503, { erro: "chave da Anthropic não configurada no projeto" });

  let itens: Item[];
  try {
    const body = await req.json();
    itens = Array.isArray(body?.itens) ? body.itens : [];
  } catch {
    return json(400, { erro: "corpo inválido" });
  }
  itens = itens
    .filter((x) => x && typeof x.id === "string" && typeof x.texto === "string" && x.texto.trim())
    .map((x) => ({
      id: x.id.slice(0, 80),
      campo: ["rec", "motivo", "desc"].includes(x.campo) ? x.campo : "rec",
      texto: x.texto.trim().slice(0, MAX_CHARS_ITEM),
      componente: typeof x.componente === "string" ? x.componente.slice(0, 80) : "",
      destino: typeof x.destino === "string" ? x.destino.slice(0, 40) : "",
      valvula: typeof x.valvula === "string" ? x.valvula.slice(0, 80) : "",
    }));
  if (!itens.length) return json(200, { itens: [] });
  if (itens.length > MAX_ITENS) return json(413, { erro: `no máximo ${MAX_ITENS} textos por vez` });
  if (itens.reduce((t, x) => t + x.texto.length, 0) > MAX_CHARS_TOTAL) return json(413, { erro: "textos longos demais" });

  const NOME_CAMPO: Record<string, string> = {
    rec: "recomendação técnica",
    motivo: "motivo da condenação da válvula",
    desc: "descrição do serviço na proposta de aditivo",
  };
  const pedido = itens
    .map((x) =>
      [
        `id: ${x.id}`,
        `tipo de texto: ${NOME_CAMPO[x.campo]}`,
        x.valvula && `válvula: ${x.valvula}`,
        x.componente && `componente: ${x.componente}`,
        x.destino && `destino: ${x.destino}`,
        `texto original: ${x.texto}`,
      ].filter(Boolean).join("\n")
    )
    .join("\n\n");

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: pedido }],
    });
    if (response.stop_reason === "refusal") return json(502, { erro: "o modelo recusou o pedido" });
    if (response.stop_reason === "max_tokens") return json(502, { erro: "resposta incompleta" });
    const texto = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const saida = JSON.parse(texto) as { itens: { id: string; texto: string }[] };
    const ids = new Set(itens.map((x) => x.id));
    return json(200, { itens: (saida.itens || []).filter((x) => ids.has(x.id) && x.texto.trim()) });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json(503, { erro: "chave da Anthropic inválida" });
    if (e instanceof Anthropic.RateLimitError) return json(429, { erro: "limite de uso atingido, tente de novo" });
    if (e instanceof Anthropic.APIError) return json(502, { erro: `erro da API (${e.status})` });
    return json(500, { erro: "falha ao aprimorar o texto" });
  }
});
