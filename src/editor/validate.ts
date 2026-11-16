/**
 * Config checks shared by the cards. A card's static `validateConfig(config)`
 * returns Issues: `setConfig` throws on the first error (HA shows its error
 * card, with the English message), and the visual editor lists every issue in
 * Japanese above the form while it is being edited, so a typo is caught before
 * the card is saved.
 *
 *  error    the card can't work this way (setConfig refuses it)
 *  warning  the card works, but probably not as meant
 */
export interface Issue {
  /** Where: "hours", "levels.2.max", "badges.1.domain". The first part is the form field. */
  path: string;
  level: 'error' | 'warning';
  /** English, for HA's error card (matches the cards' other `… must be …` errors). */
  message: string;
  /** Japanese, for the editor. */
  hint: string;
}

export type ConfigValidator = (config: Record<string, unknown>) => Issue[];

const error = (path: string, message: string, hint: string): Issue => ({ path, level: 'error', message, hint });
const warning = (path: string, message: string, hint: string): Issue => ({ path, level: 'warning', message, hint });

/** The value at a dotted path ("levels.2.max"). */
function at(config: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), config);
}

/**
 * A number within [min, max] (and a whole number with `integer`). Missing is fine
 * unless `required`. YAML strings like "24" are refused: HA's form always writes numbers.
 */
export function checkNumber(
  config: unknown,
  path: string,
  opts: { min?: number; max?: number; integer?: boolean; required?: boolean; label: string; unit?: string },
): Issue[] {
  const v = at(config, path);
  if (v === undefined || v === null || v === '') {
    return opts.required ? [error(path, `${path} is required`, `${opts.label}を入力してください`)] : [];
  }
  const range =
    opts.min !== undefined && opts.max !== undefined
      ? `${opts.min}〜${opts.max}${opts.unit ?? ''}`
      : opts.min !== undefined
        ? `${opts.min}${opts.unit ?? ''}以上`
        : opts.max !== undefined
          ? `${opts.max}${opts.unit ?? ''}以下`
          : '';
  const kind = opts.integer ? 'a whole number' : 'a number';
  const enRange =
    opts.min !== undefined && opts.max !== undefined
      ? ` from ${opts.min} to ${opts.max}`
      : opts.min !== undefined
        ? ` of at least ${opts.min}`
        : opts.max !== undefined
          ? ` of at most ${opts.max}`
          : '';
  const bad = () => [error(path, `${path} must be ${kind}${enRange}`, `${opts.label}は${range ? `${range}の` : ''}${opts.integer ? '整数' : '数値'}にしてください（いまは ${JSON.stringify(v)}）`)];
  if (typeof v !== 'number' || !Number.isFinite(v)) return bad();
  if (opts.integer && !Number.isInteger(v)) return bad();
  if ((opts.min !== undefined && v < opts.min) || (opts.max !== undefined && v > opts.max)) return bad();
  return [];
}

/** One of `options` (missing is fine). */
export function checkOneOf(config: unknown, path: string, options: readonly string[], label: string): Issue[] {
  const v = at(config, path);
  // The form may leave an emptied select as '' or null: that is "not set".
  if (v === undefined || v === null || v === '') return [];
  if (typeof v === 'string' && options.includes(v)) return [];
  return [error(path, `${path} must be one of: ${options.join(', ')}`, `${label}は ${options.join('・')} のどれかにしてください（いまは ${JSON.stringify(v)}）`)];
}

/** An entity id of one of these domains (missing is fine unless `required`). */
export function checkEntity(
  config: unknown,
  path: string,
  domains: readonly string[] | undefined,
  label: string,
  required = false,
): Issue[] {
  const v = at(config, path);
  if (v === undefined || v === '') return required ? [error(path, `${path} is required`, `${label}を選んでください`)] : [];
  if (typeof v !== 'string' || !ENTITY_ID.test(v)) {
    return [error(path, `${path} must be an entity id like light.living`, `${label}は light.living のようなエンティティ ID にしてください（いまは ${JSON.stringify(v)}）`)];
  }
  const domain = v.split('.')[0];
  if (domains && !domains.includes(domain)) {
    const list = domains.join(', ');
    return [error(path, domains.length === 1 ? `${path} must be a ${list} entity` : `${path} must be one of: ${list}`, `${label}には ${domains.join('・')} のエンティティを選んでください（いまは ${v}）`)];
  }
  return [];
}

const DOMAIN = /^[a-z][a-z0-9_]*$/;
const ENTITY_ID = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;

/** An HA domain such as "light" or "binary_sensor" (missing is fine). */
export function checkDomain(config: unknown, path: string, label: string): Issue[] {
  const v = at(config, path);
  if (v === undefined) return [];
  if (typeof v === 'string' && DOMAIN.test(v)) return [];
  const hint =
    typeof v === 'string' && v.includes('.')
      ? `${label}には「light」のようにドメインだけを書いてください（「${v}」はエンティティ ID です。個別に指定するときは entities に）`
      : `${label}は light や binary_sensor のような小文字のドメイン名にしてください（いまは ${JSON.stringify(v)}）`;
  return [error(path, `${path} must be a domain like light or binary_sensor`, hint)];
}

/** "HH:MM" (24h). */
export function checkTime(config: unknown, path: string, label: string): Issue[] {
  const v = at(config, path);
  if (v === undefined || v === '') return [];
  const m = typeof v === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(v) : null;
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return [];
  return [error(path, `${path} must be a time like 08:30`, `${label}は 08:30 のように「時:分」で書いてください（いまは ${JSON.stringify(v)}）`)];
}

/** "YYYY-MM-DD" that is a real date (not 2026-02-30). */
export function isDate(v: unknown): boolean {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * Value levels (sensor and value cards): every level needs a label and a
 * numeric `max` except the last; the bounds should rise.
 */
export function checkLevels(config: unknown, path = 'levels'): Issue[] {
  const levels = at(config, path);
  if (levels === undefined) return [];
  if (!Array.isArray(levels)) return [error(path, `${path} must be a list`, '値の段階はリストで書いてください')];
  const out: Issue[] = [];
  let prev = -Infinity;
  levels.forEach((l: Record<string, unknown> | undefined, i) => {
    const p = `${path}.${i}`;
    if (!l || typeof l !== 'object' || !l.label) out.push(error(`${p}.label`, `${p}.label is required`, `値の段階 ${i + 1} に表示（label）を入れてください`));
    const max = l?.max;
    if (max === undefined || max === null || max === '') {
      if (i < levels.length - 1) {
        out.push(warning(`${p}.max`, `${p}.max is missing: the levels after it are never used`, `値の段階 ${i + 1} に上限がないため、それより後の段階は使われません。上限を省けるのは最後の段階だけです`));
      }
      return;
    }
    if (typeof max !== 'number' || !Number.isFinite(max)) {
      out.push(error(`${p}.max`, `${p}.max must be a number`, `値の段階 ${i + 1} の上限は数値にしてください（いまは ${JSON.stringify(max)}）`));
      return;
    }
    if (max <= prev) {
      out.push(warning(`${p}.max`, `${p}.max should be larger than the level before`, `値の段階 ${i + 1} の上限（${max}）が前の段階以下です。段階は上限の小さい順に並べてください`));
    }
    prev = max;
  });
  return out;
}

/** Throw the first error, the way HA expects setConfig to refuse a config. */
export function throwFirstError(issues: Issue[]): void {
  const first = issues.find((i) => i.level === 'error');
  if (first) throw new Error(first.message);
}

/** A count / average / date summary (badges, headings). */
export function checkSummary(config: unknown, path: string, label: string): Issue[] {
  const s = at(config, path) as Record<string, unknown> | undefined;
  if (!s || typeof s !== 'object') return [];
  const out = [...checkOneOf(config, `${path}.type`, ['count', 'average', 'date'], `${label}の種類`)];
  if (s.type === 'date') return out;
  out.push(...checkDomain(config, `${path}.domain`, `${label}のドメイン`));
  out.push(...checkNumber(config, `${path}.decimals`, { min: 0, max: 6, integer: true, label: `${label}の小数点以下の桁数` }));
  const entities = s.entities;
  if (entities !== undefined && !Array.isArray(entities)) {
    out.push(error(`${path}.entities`, `${path}.entities must be a list of entity ids`, `${label}のエンティティはリストで書いてください`));
  } else {
    (entities as unknown[] | undefined)?.forEach((_, i) => out.push(...checkEntity(config, `${path}.entities.${i}`, undefined, `${label}のエンティティ ${i + 1}`)));
  }
  const hasEntities = Array.isArray(entities) && entities.length > 0;
  if (s.type === 'average' && !hasEntities) {
    out.push(error(`${path}.entities`, `${path}: an average needs entities`, `${label}（平均）には entities を指定してください`));
  } else if (s.type === 'count' && !hasEntities && !s.domain) {
    out.push(error(`${path}.domain`, `${path}: a count needs entities or a domain`, `${label}（件数）には entities か domain を指定してください`));
  }
  return out;
}
