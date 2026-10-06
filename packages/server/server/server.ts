import { venda } from './app';
import { adminResponse } from './admin';

export default {
  async fetch(request: Request): Promise<Response> {
    return adminResponse(request) ?? (await venda.load()).fetch(request);
  }
};
