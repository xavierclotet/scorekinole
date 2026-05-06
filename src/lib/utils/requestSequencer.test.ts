import { describe, it, expect } from 'vitest';
import { createRequestSequencer } from './requestSequencer';

describe('createRequestSequencer', () => {
  it('next() returns monotonically increasing ids starting at 1', () => {
    const seq = createRequestSequencer();
    expect(seq.next()).toBe(1);
    expect(seq.next()).toBe(2);
    expect(seq.next()).toBe(3);
  });

  it('only the most recently issued id is the latest', () => {
    const seq = createRequestSequencer();
    const a = seq.next();
    const b = seq.next();
    expect(seq.isLatest(a)).toBe(false);
    expect(seq.isLatest(b)).toBe(true);
  });

  it('a stale id stays stale even if no further next() is called', () => {
    const seq = createRequestSequencer();
    const a = seq.next();
    seq.next();
    expect(seq.isLatest(a)).toBe(false);
    // still stale on subsequent checks
    expect(seq.isLatest(a)).toBe(false);
  });

  it('models the typeahead race: late response from earlier query is dropped', () => {
    const seq = createRequestSequencer();
    const firstQueryId = seq.next();   // user types "an"
    const secondQueryId = seq.next();  // user types "ana" before first resolved
    // First query finally resolves — must be ignored
    expect(seq.isLatest(firstQueryId)).toBe(false);
    // Second query resolves — must be applied
    expect(seq.isLatest(secondQueryId)).toBe(true);
  });

  it('two independent sequencers do not interfere with each other', () => {
    const a = createRequestSequencer();
    const b = createRequestSequencer();
    const aId = a.next();
    b.next(); b.next();
    expect(a.isLatest(aId)).toBe(true);
    expect(b.isLatest(aId)).toBe(false); // b is on its own counter
  });
});
