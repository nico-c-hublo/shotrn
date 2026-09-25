import { EventEmitter } from 'node:events';
import type { ExecutionContext } from '@nestjs/common';
import { UnknownCodeGuard } from './unknown-code.guard';
import { UnknownCodeLimiter, type Admission } from './unknown-code-limiter';

class FakeResponse extends EventEmitter {
  statusCode = 200;
  destroyed = false;
  setHeader(): void {}
}

function fakeRequest(code = 'abcdefghijklm') {
  const res = new FakeResponse();
  const req = { ip: '203.0.113.1', params: { code } };
  // Only the HTTP accessors the guard uses are implemented.
  const context = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { res, context };
}

/** Resolves on the next macrotask, after every promise that can settle already has. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

function track(pending: Promise<Admission>) {
  const state: { result?: Admission } = {};
  void pending.then((result) => (state.result = result));
  return state;
}

describe('UnknownCodeGuard', () => {
  // A request that waits in admit() can lose its client before it is admitted. The
  // response has then already emitted 'close', so a listener added afterwards never fires
  // and, without the fix, the reservation stays taken for good.
  it('releases the reservation of a client that hung up while waiting', async () => {
    const limiter = new UnknownCodeLimiter(1, 10 * 60 * 1000);
    const guard = new UnknownCodeGuard(limiter);

    const first = fakeRequest();
    await guard.canActivate(first.context);

    const second = fakeRequest();
    const waiting = guard.canActivate(second.context);
    second.res.destroyed = true;
    second.res.emit('close');

    first.res.emit('finish'); // a hit: frees the only place, so the second is admitted
    await waiting;

    const next = track(limiter.admit('203.0.113.1'));
    await flush();
    expect(next.result?.admitted).toBe(true);
  });

  it('leaves a malformed code out of the budget entirely', async () => {
    const limiter = new UnknownCodeLimiter(1, 10 * 60 * 1000);
    const admit = jest.spyOn(limiter, 'admit');
    const guard = new UnknownCodeGuard(limiter);

    expect(await guard.canActivate(fakeRequest('favicon.ico').context)).toBe(true);
    expect(admit).not.toHaveBeenCalled();
  });

  it('charges a lookup that answered 404', async () => {
    const limiter = new UnknownCodeLimiter(1, 10 * 60 * 1000);
    const guard = new UnknownCodeGuard(limiter);

    const lookup = fakeRequest();
    await guard.canActivate(lookup.context);
    lookup.res.statusCode = 404;
    lookup.res.emit('finish');

    expect((await limiter.admit('203.0.113.1')).admitted).toBe(false);
  });
});
