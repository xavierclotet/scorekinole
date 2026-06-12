import { describe, it, expect } from 'vitest';
import { serializeJsonLd } from './jsonLd';

const LS = String.fromCharCode(0x2028); // line separator
const PS = String.fromCharCode(0x2029); // paragraph separator

describe('serializeJsonLd', () => {
  it('escapes < > & so the JSON cannot break out of a <script> tag', () => {
    const out = serializeJsonLd({ name: 'a < b & c > d' });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain('\\u003c');
    expect(out).toContain('\\u003e');
    expect(out).toContain('\\u0026');
  });

  it('neutralizes a </script> injection in a string value', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('\\u003c/script\\u003e');
  });

  it('escapes the U+2028 / U+2029 line separators', () => {
    const out = serializeJsonLd({ name: `a${LS}b${PS}c` });
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });

  it('stays valid JSON: parsing the escaped output round-trips the value', () => {
    const value = { name: '</script> & <b>', nested: { x: 1 } };
    expect(JSON.parse(serializeJsonLd(value))).toEqual([value]);
  });

  it('wraps a single object into an array (matches schema.org graph usage)', () => {
    expect(JSON.parse(serializeJsonLd({ a: 1 }))).toEqual([{ a: 1 }]);
  });

  it('passes arrays through as-is (still array-shaped)', () => {
    expect(JSON.parse(serializeJsonLd([{ a: 1 }, { b: 2 }]))).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
