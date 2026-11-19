import { describe, expect, it, vi } from 'vitest';
import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { FetchTracker } from '../src/ha/fetch-state';
import { statusPhrase, updatedLabel } from '../src/components/m3e-fetch-status';

function host() {
  const controllers: ReactiveController[] = [];
  const h = {
    addController: (c: ReactiveController) => controllers.push(c),
    removeController: () => {},
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  } satisfies ReactiveControllerHost;
  return { h, controllers };
}

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
};

describe('FetchTracker', () => {
  it('goes loading → ok / empty, records the time, and re-renders the host', async () => {
    const { h } = host();
    const t = new FetchTracker<number[]>(h);
    let shown: number[] = [];
    const p = t.run('a', async () => [1], (v) => (shown = v));
    expect(t.status).toBe('loading');
    expect(await p).toBe(true);
    expect(shown).toEqual([1]);
    expect(t.view).toMatchObject({ status: 'ok', hasData: true });
    expect(t.updatedAt).toBeTypeOf('number');
    await t.run('a', async () => [], (v) => (shown = v));
    expect(t.status).toBe('empty');
    expect(h.requestUpdate).toHaveBeenCalled();
  });

  it('drops an answer overtaken by a newer fetch', async () => {
    const { h } = host();
    const t = new FetchTracker<string>(h);
    const slow = deferred<string>();
    const applied: string[] = [];
    const first = t.run('a', () => slow.promise, (v) => applied.push(v));
    await t.run('b', async () => 'B', (v) => applied.push(v));
    slow.resolve('A');
    expect(await first).toBe(false);
    expect(applied).toEqual(['B']);
    expect(t.shownKey).toBe('b');
  });

  it('a failure keeps the data of the same key, but not of another key', async () => {
    const { h } = host();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = new FetchTracker<string>(h, { label: 'test' });
    await t.run('a', async () => 'A', () => {});
    await t.run('a', () => Promise.reject(new Error('x')), () => {});
    expect(t.view).toMatchObject({ status: 'error', hasData: true });
    expect(t.updatedAt).toBeTypeOf('number');
    await t.run('b', () => Promise.reject(new Error('x')), () => {});
    expect(t.view).toEqual({ status: 'error', hasData: false, updatedAt: undefined });
    expect(warn).toHaveBeenCalledWith('test: fetch failed', expect.any(Error));
    warn.mockRestore();
  });

  it('drops an answer that arrives after the card left the page and clears the aborted key', async () => {
    const { h, controllers } = host();
    const t = new FetchTracker<string>(h);
    const slow = deferred<string>();
    const applied: string[] = [];
    const p = t.run('a', () => slow.promise, (v) => applied.push(v));
    controllers[0].hostDisconnected?.();
    slow.resolve('A');
    expect(await p).toBe(false);
    expect(applied).toEqual([]);
    expect(t.status).toBe('idle');
    expect(t.key).toBeUndefined();
  });

  it('keeps empty status when a background refresh is aborted by disconnect', async () => {
    const { h, controllers } = host();
    const t = new FetchTracker<number[]>(h);
    await t.run('a', async () => [], () => {});
    expect(t.status).toBe('empty');
    const slow = deferred<number[]>();
    const p = t.run('a', () => slow.promise, () => {});
    controllers[0].hostDisconnected?.();
    expect(t.status).toBe('empty');
    expect(t.key).toBe('a');
    slow.resolve([1]);
    expect(await p).toBe(false);
  });
});

describe('status labels', () => {
  const at = new Date(2026, 10, 16, 9, 5).getTime();
  it('shows the time today and the date on other days', () => {
    expect(updatedLabel(at, at + 3600_000)).toBe('9:05');
    expect(updatedLabel(at, at + 86400_000)).toBe('11/16 9:05');
  });
  it('phrases each status for a subtitle', () => {
    const now = at + 60_000;
    expect(statusPhrase({ status: 'ok', updatedAt: at, hasData: true }, undefined, now)).toBe('9:05 更新');
    expect(statusPhrase({ status: 'ok', hasData: false }, undefined, now)).toBe('');
    expect(statusPhrase({ status: 'loading', hasData: false }, undefined, now)).toBe('読み込み中…');
    expect(statusPhrase({ status: 'loading', updatedAt: at, hasData: true }, undefined, now)).toBe('9:05 更新・更新中…');
    expect(statusPhrase({ status: 'empty', updatedAt: at, hasData: true }, '履歴なし', now)).toBe('履歴なし');
    expect(statusPhrase({ status: 'error', updatedAt: at, hasData: true }, undefined, now)).toBe('');
  });
});
