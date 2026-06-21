import type { ConsultTurn } from "./consult.js";

/** Holds the in-progress consultation transcript per Telegram chat. */
export class ConversationStore {
  private byChat = new Map<number, ConsultTurn[]>();

  get(chatId: number): ConsultTurn[] {
    return this.byChat.get(chatId) ?? [];
  }

  append(chatId: number, turn: ConsultTurn): void {
    const history = this.byChat.get(chatId) ?? [];
    history.push(turn);
    this.byChat.set(chatId, history);
  }

  reset(chatId: number): void {
    this.byChat.delete(chatId);
  }
}
