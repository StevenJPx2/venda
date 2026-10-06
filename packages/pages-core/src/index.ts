import type { AdminPlugin } from '@venda/admin';

export default {
  id: 'venda.accounts',
  pages: [
    {
      id: 'accounts.people',
      path: 'settings/people',
      title: 'People',
      section: 'settings',
      access: 'administrator',
      load: () => import('./PeopleView.vue'),
      nav: {
        label: 'People',
        icon: 'i-lucide-users',
        description: 'Who can sign in, their roles, and who is disabled.'
      }
    },
    {
      id: 'accounts.invitations',
      path: 'settings/invitations',
      title: 'Invitations',
      section: 'settings',
      access: 'administrator',
      load: () => import('./InvitationsView.vue'),
      nav: {
        label: 'Invitations',
        icon: 'i-lucide-mail',
        description: 'Invite someone with a private link, and revoke open ones.'
      }
    },
    {
      id: 'accounts.tokens',
      path: 'settings/tokens',
      title: 'API tokens',
      section: 'settings',
      access: 'signed-in',
      load: () => import('./TokensView.vue'),
      nav: {
        label: 'API tokens',
        icon: 'i-lucide-key-round',
        description: 'Keys for scripts and sites that read or write as you.'
      }
    },
    {
      id: 'accounts.profile',
      path: 'account',
      title: 'Your account',
      section: 'account',
      access: 'signed-in',
      load: () => import('./AccountView.vue'),
      nav: { label: 'Your account', icon: 'i-lucide-circle-user' }
    },
    {
      id: 'accounts.join',
      path: 'join/:token',
      title: 'Join Venda',
      section: 'public',
      access: 'public',
      load: () => import('./JoinView.vue')
    }
  ]
} satisfies AdminPlugin;
