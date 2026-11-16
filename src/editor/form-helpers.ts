/**
 * Building blocks for the cards' getConfigForm(): list fields edited item by
 * item (HA's object selector with `fields` + `multiple`) instead of raw YAML.
 */
import { ACCENT_OPTIONS } from '../theme/tokens';

type Selector = Record<string, unknown>;
interface Field {
  label: string;
  selector: Selector;
  required?: boolean;
}

export const field = {
  entity: (label: string, filter: Record<string, unknown> = {}, required = false): Field => ({ label, required, selector: { entity: filter } }),
  entities: (label: string, filter: Record<string, unknown> = {}): Field => ({ label, selector: { entity: { ...filter, multiple: true } } }),
  text: (label: string, required = false): Field => ({ label, required, selector: { text: {} } }),
  texts: (label: string): Field => ({ label, selector: { text: { multiple: true } } }),
  icon: (label = 'アイコン'): Field => ({ label, selector: { icon: {} } }),
  accent: (label = '色'): Field => ({ label, selector: { select: { mode: 'dropdown', options: ACCENT_OPTIONS } } }),
  number: (label: string, opts: Record<string, unknown> = {}, required = false): Field => ({
    label,
    required,
    selector: { number: { mode: 'box', ...opts } },
  }),
  boolean: (label: string): Field => ({ label, selector: { boolean: {} } }),
  select: (label: string, options: (string | { value: string; label: string })[], multiple = false, required = false): Field => ({
    label,
    required,
    selector: { select: { mode: multiple ? 'list' : 'dropdown', multiple, options } },
  }),
};

/** A list of objects, each edited with `fields`; the list shows `label` (and `description`) per item. */
export function listOf(name: string, fields: Record<string, Field>, label: string, description?: string, required = false) {
  return {
    name,
    required,
    selector: { object: { multiple: true, label_field: label, description_field: description, fields } },
  };
}

/** One object edited with `fields` (not a list). */
export function objectOf(name: string, fields: Record<string, Field>) {
  return { name, selector: { object: { fields } } };
}

/** `levels` of the sensor and value cards: chips and colours by value. */
export function levelsField() {
  return listOf(
    'levels',
    { max: field.number('この値未満（最後の段階は空欄）'), label: field.text('表示', true), color: field.accent() },
    'label',
    'max',
  );
}

/**
 * For toForm(): list items written as plain ids ("person.yuki") become
 * `{ [key]: id }` objects so the list editor can show them.
 */
export function idsToObjects(config: Record<string, unknown>, list: string, key = 'entity'): Record<string, unknown> {
  const items = config[list];
  if (!Array.isArray(items) || !items.some((i) => typeof i === 'string')) return config;
  return { ...config, [list]: items.map((i) => (typeof i === 'string' ? { [key]: i } : i)) };
}
