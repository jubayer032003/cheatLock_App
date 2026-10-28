/** Drop late responses after navigation, unmount, or a newer refresh. */
export class RequestGate {
  private scope: string;
  private version = 0;
  constructor(scope: string) { this.scope = scope; }
  selectScope(scope: string) { if (this.scope !== scope) { this.scope = scope; this.version++; } }
  begin(scope: string) { return scope === this.scope ? { scope, version: ++this.version } : null; }
  isCurrent(token: { scope: string; version: number }) { return token.scope === this.scope && token.version === this.version; }
  invalidate() { this.version++; }
}