import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { receberResposta, type RespostaRecebida } from './servico';

/**
 * US-30: webhook da WhatsApp Cloud API (sem login: quem chama é a Meta).
 * - GET: verificação da assinatura do webhook (hub.verify_token = WHATSAPP_VERIFY_TOKEN).
 * - POST: mensagens recebidas, aceitas só com X-Hub-Signature-256 válido (WHATSAPP_APP_SECRET).
 * Sem as variáveis configuradas, as rotas respondem 404: nada entra sem assinatura.
 */
export const rotasWebhookWhatsapp = Router();

export function assinaturaValida(corpo: Buffer | undefined, cabecalho: string | undefined, segredo: string): boolean {
  if (!corpo || !cabecalho?.startsWith('sha256=')) return false;
  const esperada = createHmac('sha256', segredo).update(corpo).digest();
  const recebida = Buffer.from(cabecalho.slice(7), 'hex');
  return recebida.length === esperada.length && timingSafeEqual(recebida, esperada);
}

/** Extrai as mensagens de texto e de botão do formato do webhook da Meta. */
export function extrairRespostas(corpo: unknown): RespostaRecebida[] {
  const respostas: RespostaRecebida[] = [];
  const entradas = (corpo as { entry?: unknown[] } | null)?.entry;
  for (const entrada of Array.isArray(entradas) ? entradas : []) {
    for (const mudanca of (entrada as { changes?: unknown[] }).changes ?? []) {
      const mensagens = (mudanca as { value?: { messages?: unknown[] } }).value?.messages ?? [];
      for (const m of mensagens as Record<string, any>[]) {
        const texto = m.type === 'text' ? m.text?.body
          : m.type === 'button' ? (m.button?.payload ?? m.button?.text)
          : m.type === 'interactive' ? (m.interactive?.button_reply?.id ?? m.interactive?.button_reply?.title)
          : undefined;
        if (typeof m.id !== 'string' || typeof m.from !== 'string' || typeof texto !== 'string') continue;
        const segundos = Number(m.timestamp);
        respostas.push({ idMensagem: m.id, telefone: m.from, texto, recebidaEm: Number.isFinite(segundos) ? new Date(segundos * 1000) : new Date() });
      }
    }
  }
  return respostas;
}

rotasWebhookWhatsapp.get('/webhook', (req, res) => {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!token) { res.sendStatus(404); return; }
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === token) {
    res.type('text/plain').send(String(req.query['hub.challenge'] ?? '')); return;
  }
  res.sendStatus(403);
});

rotasWebhookWhatsapp.post('/webhook', async (req: Request & { corpoBruto?: Buffer }, res) => {
  const segredo = process.env.WHATSAPP_APP_SECRET;
  if (!segredo) { res.sendStatus(404); return; }
  if (!assinaturaValida(req.corpoBruto, req.get('x-hub-signature-256'), segredo)) { res.sendStatus(401); return; }
  for (const resposta of extrairRespostas(req.body)) await receberResposta(resposta);
  // 200 sempre que a assinatura confere: a Meta repete a entrega em qualquer outra resposta.
  res.sendStatus(200);
});

/** Demonstração (TEST_CONTROLS, administrador): simula a resposta do paciente sem a Meta. */
export const rotasDemoWhatsapp = Router();
rotasDemoWhatsapp.post('/whatsapp/resposta', async (req, res) => {
  const dados = z.object({ telefone: z.string().regex(/^\+?\d{10,13}$/), texto: z.string().min(1).max(200), idMensagem: z.string().min(1).max(200).optional() }).strict().parse(req.body);
  res.json(await receberResposta({ idMensagem: dados.idMensagem ?? `demo-${randomUUID()}`, telefone: dados.telefone, texto: dados.texto, recebidaEm: new Date() }));
});
