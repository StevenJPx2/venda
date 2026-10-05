import { loadApp } from './app';

export default {
  async fetch(request: Request): Promise<Response> {
    return (await loadApp()).fetch(request);
  }
};
