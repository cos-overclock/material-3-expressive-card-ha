/** customElements.define that tolerates the bundle being loaded twice. */
export function define(name: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(name)) customElements.define(name, ctor);
}
