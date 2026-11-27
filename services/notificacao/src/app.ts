import express from 'express';
import { verificarSessaoRemota, type IdentidadeAcesso } from '@clinica/eventos';
import { rotasAtividades } from './atividades/rotas';
import { rotasAutorizacoes } from './autorizacoes/rotas';
import { rotasDemoWhatsapp, rotasWebhookWhatsapp } from './confirmacoes/rotas';
import { rotasDemo } from './demo/rotas';
import { rotasEnvio } from './envio/rotas';
import { tratarErros } from './http/erros';
import { rotasLembretes } from './lembretes/rotas';
import { rotasOperacao } from './reprocessamento/rotas';

export function criarApp(identificar: (authorization: string | undefined) => IdentidadeAcesso | null | Promise<IdentidadeAcesso | null> = verificarSessaoRemota) {
  const app = express();
  // US-30: guarda o corpo bruto para conferir a assinatura do webhook do WhatsApp.
  app.use(express.json({ verify: (req, _res, corpo) => { (req as { corpoBruto?: Buffer }).corpoBruto = corpo; } }));

  app.get('/saude', (_req, res) => {
    res.json({ servico: 'notificacao', status: 'ok' });
  });
  // US-30: chamado pela Meta, sem login; protegido pela assinatura (confirmacoes/rotas.ts).
  app.use('/whatsapp', rotasWebhookWhatsapp);
  app.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    let usuario: IdentidadeAcesso | null;
    try { usuario = await identificar(req.headers.authorization); }
    catch { res.status(503).json({ erro: 'Validação de sessão indisponível.' }); return; }
    if (!usuario) { res.status(401).json({ erro: 'Login obrigatório.' }); return; }
    // Só a equipe da recepção; profissional e paciente (US-27) não veem lembretes de outros.
    if (usuario.perfil !== 'administrador' && usuario.perfil !== 'recepcionista') { res.status(403).json({ erro: 'Acesso restrito.' }); return; }
    res.locals.usuario = usuario;
    next();
  });
  app.use('/lembretes', rotasLembretes);
  app.use('/envio', rotasEnvio);
  app.use('/atividades', rotasAtividades);
  app.use('/autorizacoes', rotasAutorizacoes);
  app.use('/operacao', (_req, res, next) => {
    if (res.locals.usuario.perfil !== 'administrador') { res.status(403).json({ erro: 'Acesso restrito.' }); return; } next();
  }, rotasOperacao);
  if (process.env.TEST_CONTROLS === 'true') app.use('/demo', (req, res, next) => {
    if (res.locals.usuario.perfil !== 'administrador') { res.sendStatus(403); return; } next();
  }, rotasDemo, rotasDemoWhatsapp);

  app.use(tratarErros);
  return app;
}
