/**
 * Ownership of pending shell commands, not cancellation of the shared world
 * loader or of travel that a command has already authorized.
 */
export class TerminalRequests {
  private revision = 0;

  invalidate(): void {
    this.revision += 1;
  }

  begin(isOpen: () => boolean): () => boolean {
    this.invalidate();
    const isLatest = this.checkpoint();
    return () => isLatest() && isOpen();
  }

  /** Track completion after an intentional close, without requiring an overlay. */
  checkpoint(): () => boolean {
    const revision = this.revision;
    return () => revision === this.revision;
  }
}
