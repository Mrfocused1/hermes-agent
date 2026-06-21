export interface ConsultTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Per-chat consultation transcript and images. Images are split into two
 * buckets because they're used differently:
 *  - embeds: the user's own images → committed as real site assets AND used
 *    to shape the design.
 *  - references: style-only images (e.g. a screenshot of a site they like) →
 *    used to shape the design but NOT embedded on their site.
 */
export class ConversationStore {
  private byChat = new Map<number, ConsultTurn[]>();
  private embedsByChat = new Map<number, string[]>();
  private refsByChat = new Map<number, string[]>();

  get(chatId: number): ConsultTurn[] {
    return this.byChat.get(chatId) ?? [];
  }

  append(chatId: number, turn: ConsultTurn): void {
    const history = this.byChat.get(chatId) ?? [];
    history.push(turn);
    this.byChat.set(chatId, history);
  }

  /** A user image to feature on the site (embedded + shapes the design). */
  addEmbed(chatId: number, base64: string): void {
    const list = this.embedsByChat.get(chatId) ?? [];
    list.push(base64);
    this.embedsByChat.set(chatId, list);
  }

  /** A style-only reference image (shapes the design, not embedded). */
  addReference(chatId: number, base64: string): void {
    const list = this.refsByChat.get(chatId) ?? [];
    list.push(base64);
    this.refsByChat.set(chatId, list);
  }

  getEmbeds(chatId: number): string[] {
    return this.embedsByChat.get(chatId) ?? [];
  }

  getReferences(chatId: number): string[] {
    return this.refsByChat.get(chatId) ?? [];
  }

  /** Total images of either kind (handy for status notes). */
  imageCount(chatId: number): number {
    return this.getEmbeds(chatId).length + this.getReferences(chatId).length;
  }

  /** Clear stored images (e.g. after they've been used in a build). */
  clearImages(chatId: number): void {
    this.embedsByChat.delete(chatId);
    this.refsByChat.delete(chatId);
  }

  reset(chatId: number): void {
    this.byChat.delete(chatId);
    this.clearImages(chatId);
  }
}
