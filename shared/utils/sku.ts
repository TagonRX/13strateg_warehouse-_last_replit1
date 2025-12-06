export type ParsedSku = {
  prefix: string; // letters prefix, e.g. 'A'
  number: number | null; // numeric part, e.g. 203
  suffix: string; // trailing part after dash or extra letters, e.g. '-H'
};

// Parse SKU or location like 'A203-H' or 'Z12' into prefix/number/suffix
export function parseSku(input: string): ParsedSku {
  const s = (input || '').trim().toUpperCase();
  // Match: letters + digits optionally followed by non-space suffix
  const m = s.match(/^([A-Z]+)(\d{1,4})(.*)$/);
  if (m) {
    const [, letters, numStr, rest] = m;
    return {
      prefix: letters,
      number: parseInt(numStr, 10),
      suffix: rest || '',
    };
  }
  // Fallback: only letters at start
  const m2 = s.match(/^([A-Z]+)(.*)$/);
  if (m2) {
    const [, letters, rest] = m2;
    return { prefix: letters, number: null, suffix: rest || '' };
  }
  return { prefix: '', number: null, suffix: '' };
}

// Sequential compare: by number ascending/descending with NaN last
export function compareSequential(a: number | null, b: number | null, dir: 'asc' | 'desc') {
  const na = a == null ? NaN : a;
  const nb = b == null ? NaN : b;
  if (isNaN(na) && isNaN(nb)) return 0;
  if (isNaN(na)) return 1;
  if (isNaN(nb)) return -1;
  return dir === 'asc' ? na - nb : nb - na;
}

// Group compare: unit digit first, then hundreds bucket
export function compareGroup(a: number | null, b: number | null, dir: 'asc' | 'desc') {
  const score = (n: number | null) => {
    if (n == null || isNaN(n)) return Number.MAX_SAFE_INTEGER;
    const unit = n % 10;
    const hundred = Math.floor(n / 100);
    return unit * 10000 + hundred; // ensure unit dominates
  };
  const sa = score(a);
  const sb = score(b);
  return dir === 'asc' ? sa - sb : sb - sa;
}
