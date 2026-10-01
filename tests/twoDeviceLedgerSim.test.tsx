/**
 * Two phones, one trip, in both directions.
 *
 * Reported from the real trip: 「我新增帳目她沒有，但她新增帳目我看得到」. One
 * direction works and the other does not, which no explanation involving two
 * separate trips can produce — a wrong trip loses both directions.
 *
 * So this models the shared ledger the way the app actually drives it: each
 * device reads, merges what it has not pushed yet, writes the whole list, and
 * deletes only what it knows it removed. If the asymmetry can be produced by
 * that logic, it will show up here, in an interleaving.
 */
import { describe, expect, it } from 'vitest';
import { mergeWithUnpushed } from '../services/syncMerge';
import { idsToPrune, nextKnownIds } from '../services/syncPrune';

interface Record_ { id: string }

/** The shared table, as far as these two devices are concerned. */
class Server {
  rows = new Map<string, Record_>();
  read(): Record_[] { return [...this.rows.values()]; }
  write(rows: Record_[], pruned: string[]) {
    rows.forEach(row => this.rows.set(row.id, row));
    pruned.forEach(id => this.rows.delete(id));
  }
}

/** One phone: what it is holding, and what it believes the server holds. */
class Device {
  local: Record_[] = [];
  known: string[] = [];
  constructor(private server: Server, readonly name: string) {}

  /** Opening the trip: the remote copy wins outright. */
  open() {
    this.local = this.server.read();
    this.known = this.local.map(row => row.id);
  }

  /** The twenty-second re-read, merged rather than applied. */
  reread() {
    const remote = this.server.read();
    this.local = mergeWithUnpushed(this.local, remote, this.known);
    this.known = remote.map(row => row.id);
  }

  add(id: string) {
    this.local = [...this.local, { id }];
  }

  remove(id: string) {
    this.local = this.local.filter(row => row.id !== id);
  }

  /** The debounced push of the whole ledger. */
  push() {
    const pruned = idsToPrune(this.known, this.local.map(row => row.id));
    this.server.write(this.local, pruned);
    this.known = [...nextKnownIds(this.known, this.local.map(row => row.id))];
  }

  has(id: string): boolean {
    return this.local.some(row => row.id === id);
  }
}

describe('two phones on one trip', () => {
  it('carries an expense in both directions', () => {
    const server = new Server();
    const owner = new Device(server, 'owner');
    const member = new Device(server, 'member');
    owner.open();
    member.open();

    owner.add('owner-1');
    owner.push();
    member.reread();
    expect(member.has('owner-1')).toBe(true);

    member.add('member-1');
    member.push();
    owner.reread();
    expect(owner.has('member-1')).toBe(true);
  });

  it('does not lose the other phone\'s expense when both write before re-reading', () => {
    const server = new Server();
    const owner = new Device(server, 'owner');
    const member = new Device(server, 'member');
    owner.open();
    member.open();

    // Both record something without having seen the other's.
    owner.add('owner-1');
    member.add('member-1');
    owner.push();
    member.push();

    owner.reread();
    member.reread();

    expect(owner.has('member-1')).toBe(true);
    expect(member.has('owner-1')).toBe(true);
    expect(server.read().map(row => row.id).sort()).toEqual(['member-1', 'owner-1']);
  });

  it('keeps an expense that arrived while the other phone was mid-edit', () => {
    const server = new Server();
    const owner = new Device(server, 'owner');
    const member = new Device(server, 'member');
    owner.open();
    member.open();

    member.add('member-1');          // typed, not pushed yet
    owner.add('owner-1');
    owner.push();                    // lands on the server first
    member.reread();                 // the read that used to wipe the draft
    expect(member.has('member-1')).toBe(true);
    expect(member.has('owner-1')).toBe(true);

    member.push();
    expect(server.read().map(row => row.id).sort()).toEqual(['member-1', 'owner-1']);
  });

  it('still lets a real deletion through, in both directions', () => {
    const server = new Server();
    const owner = new Device(server, 'owner');
    const member = new Device(server, 'member');
    owner.open();

    owner.add('owner-1');
    owner.push();
    member.open();
    expect(member.has('owner-1')).toBe(true);

    member.remove('owner-1');
    member.push();
    owner.reread();

    expect(owner.has('owner-1')).toBe(false);
    expect(server.read()).toEqual([]);
  });

  it('survives a phone that writes many times without ever re-reading', () => {
    const server = new Server();
    const owner = new Device(server, 'owner');
    const member = new Device(server, 'member');
    owner.open();
    member.open();

    // The member edits all evening and never re-reads — the shape that used to
    // delete everything the owner had done.
    member.add('member-1');
    member.push();
    owner.add('owner-1');
    owner.push();
    member.add('member-2');
    member.push();
    member.add('member-3');
    member.push();

    expect(server.read().map(row => row.id).sort())
      .toEqual(['member-1', 'member-2', 'member-3', 'owner-1']);

    member.reread();
    expect(member.has('owner-1')).toBe(true);
  });
});
