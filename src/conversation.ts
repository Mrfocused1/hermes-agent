import type { ConsultTurn } from "./consult.js";

/** Holds the in-progress consultation transcript and any reference images
 *  the user has sent, per Telegram chat. */
export class ConversationStore {
  private byChat = new Map<number, ConsultTurn[]>();
  private imagesByChat = new Map<number, string[]>();

  get(chatId: number): ConsultTurn[] {
    return this.byChat.get(chatId) ?? [];
  }

  append(chatId: number, turn: ConsultTurn): void {
    const history = this.byChat.get(chatId) ?? [];
    history.push(turn);
    this.byChat.set(chatId, history);
  }

  /** Store a base64 reference image the user sent. */
  addImage(chatId: number, base64: string): void {
    const images = this.imagesByChat.get(chatId) ?? [];
    images.push(base64);
    this.imagesByChat.set(chatId, images);
  }

  getImages(chatId: number): string[] {
    return this.imagesByChat.get(chatId) ?? [];
  }

  reset(chatId: number): void {
    this.byChat.delete(chatId);
    this.imagesByChat.delete(chatId);
  }
}
