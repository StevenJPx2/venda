// Mistakes that must not compile. This file is type-checked (pnpm typecheck)
// and never run: if any line below starts compiling, its `@ts-expect-error`
// becomes an error and the check fails. Add the mistake you almost made.
import { name } from '@gdp-ts/core';
import type { Actor, TokenId } from '@venda/contract';
import { Effect } from 'effect';
import {
  acceptInvitation, changePassword, createToken, invitationIsOpen, isAdministrator, listUsers, ownsToken, revokeToken, signedInInPerson, updateUser
} from '../src/auth';

declare const actor: Actor;

declare const other: Actor;

declare const tokenId: TokenId;

declare const joinSecret: string;

export const mistakes = [
  // Listing people without checking the caller is an administrator.
  // @ts-expect-error a proof is required
  listUsers(),

  // Changing someone with a raw id instead of a named one.
  name(actor.userId, admin => Effect.flatMap(isAdministrator(admin), proof =>
    // @ts-expect-error the target must be named
    updateUser(other.userId, { role: 'editor' }, proof))),

  // Revoking a token with a proof about a different token.
  name(actor.userId, tokenId, tokenId, (user, token, another) => Effect.flatMap(ownsToken(user, token), proof =>
    // @ts-expect-error the proof is about `token`, not `another`
    revokeToken(another, proof))),

  // Creating a token for someone else with your own in-person proof.
  name(actor.userId, other.userId, (me, them) => Effect.flatMap(signedInInPerson(me, actor), proof =>
    // @ts-expect-error the proof is about `me`, not `them`
    createToken(them, 'CI', proof))),

  // Changing a password with only an in-person proof, skipping the current password.
  name(actor.userId, user => Effect.flatMap(signedInInPerson(user, actor), proof =>
    // @ts-expect-error changing a password needs PasswordConfirmed
    changePassword(user, 'a new password', proof))),

  // Accepting an invitation with the raw link secret.
  name(joinSecret, secret => Effect.flatMap(invitationIsOpen(secret), open =>
    // @ts-expect-error the secret must be the named one the proof is about
    acceptInvitation(joinSecret, { name: 'Ann', password: 'a long password' }, open))),

  // Letting a proof escape the request it was checked in.
  // @ts-expect-error a proof cannot outlive its names
  name(actor.userId, admin => isAdministrator(admin))
];
