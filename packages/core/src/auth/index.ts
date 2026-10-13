// Accounts (docs/architecture.md, slice 2): signing in, sessions, people,
// invitations and API tokens, guarded by capability proofs.
export {
  acceptInvitation,
  changePassword,
  createInvitation,
  createToken,
  listInvitations,
  listTokens,
  listUsers,
  me,
  previewInvitation,
  revokeInvitation,
  revokeToken,
  updateUser
} from './accounts';

export {
  invitationIsOpen,
  type InvitationIsOpen
} from './proofs/invitation-is-open';

export {
  isAdministrator,
  type IsAdministrator
} from './proofs/is-administrator';

export {
  passwordConfirmed,
  signedInInPerson,
  type PasswordConfirmed,
  type SignedInInPerson
} from './proofs/in-person';

export { ownsToken, type OwnsToken } from './proofs/owns-token';

export { canEditEntry } from './proofs/can-edit-entry';

export { canCreateEntry } from './proofs/can-create-entry';

export { canPublishEntry } from './proofs/can-publish-entry';

export { canEditFiles, type CanEditFiles } from './proofs/can-edit-files';

export { canAssignOwner } from './proofs/can-assign-owner';

export { KeyValue, KeyValueError, Owner } from './services';

export {
  actorFromSession,
  actorFromToken,
  endSession,
  SESSION_TTL_SECONDS
} from './sessions';

export { signIn } from './sign-in';

export {
  canBrowseContent,
  type CanBrowseContent
} from './proofs/can-browse-content';
