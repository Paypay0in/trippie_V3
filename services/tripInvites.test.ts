import { describe, expect, it } from 'vitest';
import { INVITE_QUERY_PARAM, inviteLinkFor, inviteTokenFromUrl } from './tripInvites';

describe('the invite link', () => {
  it('is something you can paste into a message', () => {
    expect(inviteLinkFor('abc123', 'https://trippie.example.com'))
      .toBe('https://trippie.example.com/?join=abc123');
  });

  it('does not double the slash when the origin already ends in one', () => {
    expect(inviteLinkFor('abc123', 'https://trippie.example.com/'))
      .toBe('https://trippie.example.com/?join=abc123');
  });

  it('escapes the token rather than trusting it in a URL', () => {
    expect(inviteLinkFor('a b&c', 'https://x.test')).toBe('https://x.test/?join=a%20b%26c');
  });
});

describe('reading a token back off the address', () => {
  it('finds the token the link carried', () => {
    expect(inviteTokenFromUrl(`?${INVITE_QUERY_PARAM}=abc123`)).toBe('abc123');
  });

  it('finds it alongside other parameters', () => {
    expect(inviteTokenFromUrl('?lang=en&join=abc123')).toBe('abc123');
  });

  it('is quiet on an ordinary visit', () => {
    // Every app open runs through this. Returning something truthy for a
    // normal load would send people into a join flow they never asked for.
    expect(inviteTokenFromUrl('')).toBeNull();
    expect(inviteTokenFromUrl('?lang=en')).toBeNull();
  });

  it('treats an empty or blank token as no token', () => {
    expect(inviteTokenFromUrl('?join=')).toBeNull();
    expect(inviteTokenFromUrl('?join=%20%20')).toBeNull();
  });
});
