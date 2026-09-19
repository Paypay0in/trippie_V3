/**
 * No test opens a real socket.
 *
 * `App` connects with `io(window.location.origin)`, and jsdom reports that
 * origin as http://localhost:3000 — the dev server's port. So whenever a dev
 * server happened to be running, every test that rendered the app opened a
 * real connection to it, all seventy workers joined the same trip rooms, and
 * the server broadcast each worker's writes to all the others. A test would
 * have its itinerary replaced, or its accept button torn down, by a change
 * another test file made a moment earlier.
 *
 * That is what the intermittent failures were. They were never about timing
 * inside any one test: they only appeared when the whole suite ran, only when
 * a server was up to relay between the workers, and they moved from file to
 * file depending on who happened to be broadcasting.
 *
 * Real-time sync deserves its own test with an explicit server. It must never
 * be something a test picks up by accident from whatever is listening on the
 * machine.
 */
import { vi } from 'vitest';

vi.mock('socket.io-client', () => {
  const socket = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    close: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
    id: 'test-socket',
  };
  return { io: vi.fn(() => socket), default: { io: vi.fn(() => socket) }, Socket: class {} };
});
