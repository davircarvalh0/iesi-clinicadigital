import type { Canal, OrigemAutorizacao } from '../../api/tipos';

export const NOME_CANAL: Record<Canal, string> = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'E-mail' };
export const NOME_ORIGEM: Record<OrigemAutorizacao, string> = { presencial: 'na recepção', telefone: 'por telefone', formulario: 'por formulário' };
export const CANAIS: Canal[] = ['whatsapp', 'sms', 'email'];
