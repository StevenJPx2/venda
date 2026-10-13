// Deep links in the static Nuxt admin all open the same shell. Public assets
// are served by Nitro before this handler; a missing bundle must stay a 404,
// not an HTML response masquerading as JavaScript.
import shell from '#venda/admin-shell' with { type: 'text' };
import { respondToAdminPath } from '../src/admin';

export const adminResponse = (request: Request) =>
  respondToAdminPath(request, shell);
