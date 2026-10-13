// Every minute (nitro.config.ts): catch the index up with its source, even
// when a webhook never arrived.
import { defineTask } from 'nitro/task';
import { venda } from '../../app';

export default defineTask({
  meta: {
    name: 'venda:tick',
    description: "Checks the content source's head and catches the index up"
  },
  async run() {
    await (await venda.load()).tick();

    return { result: 'ok' };
  }
});
