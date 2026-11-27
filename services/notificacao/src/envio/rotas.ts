import { Router } from 'express';
import { descreverEnvio } from '../canais/configuracao-envio';
import { config } from '../config';

export const rotasEnvio = Router();

// US-15: GET /envio/configuracao — modo de envio explícito para a recepção, sem credenciais nem telefones.
rotasEnvio.get('/configuracao', (_req, res) => {
  res.json({
    ...descreverEnvio(config),
    antecedenciaMinutos: config.antecedenciaMinutos,
    modoAntecedencia: config.modoAntecedencia,
    maxTentativas: config.envioMaxTentativas,
    envioAutomaticoHabilitado: config.envioAutomaticoHabilitado,
  });
});
