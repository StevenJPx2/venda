import { venda } from './app';

export default {
  async fetch(request: Request): Promise<Response> {
    return (await venda.load()).fetch(request);
  }
};
