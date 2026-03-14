import axios, { AxiosInstance } from 'axios';
import {
  TrelloAction,
  TrelloAttachment,
  TrelloBoardSummary,
  TrelloCard,
  TrelloCheckItem,
  TrelloChecklist,
  TrelloConfig,
  TrelloCustomField,
  TrelloCustomFieldItem,
  TrelloLabel,
  TrelloList,
  TrelloMember,
  TrelloSearchResults,
} from './types.js';
import { createTrelloRateLimiters } from './rate-limiter.js';

const MAX_429_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const CARD_FIELDS = 'id,name,desc,due,idBoard,idList,idLabels,closed,url,dateLastActivity';
const BOARD_FIELDS = 'id,name,url';

export class TrelloClient {
  private axiosInstance: AxiosInstance;
  private rateLimiter;
  private readonly allowedBoardIds: Set<string>;
  private listBoardCache = new Map<string, string>();
  private cardBoardCache = new Map<string, string>();
  private checklistBoardCache = new Map<string, string>();

  constructor(private config: TrelloConfig) {
    this.allowedBoardIds = new Set([config.boardId, ...(config.allowedBoardIds ?? [])]);

    this.axiosInstance = axios.create({
      baseURL: 'https://api.trello.com/1',
      timeout: 30000,
      maxContentLength: 5 * 1024 * 1024,
      maxBodyLength: 1 * 1024 * 1024,
      params: {
        key: config.apiKey,
        token: config.token,
      },
    });

    this.rateLimiter = createTrelloRateLimiters();

    this.axiosInstance.interceptors.request.use(async requestConfig => {
      await this.rateLimiter.waitForAvailable();
      return requestConfig;
    });
  }

  private getAllowedBoardIds(): string[] {
    return [...this.allowedBoardIds];
  }

  private assertBoardAllowed(boardId: string, resourceType: string, resourceId: string): void {
    if (!this.allowedBoardIds.has(boardId)) {
      throw new Error(`${resourceType} ${resourceId} is outside the allowed board scope`);
    }
  }

  private resolveBoardId(boardId?: string): string {
    const resolvedBoardId = boardId ?? this.config.boardId;
    this.assertBoardAllowed(resolvedBoardId, 'Board', resolvedBoardId);
    return resolvedBoardId;
  }

  private async assertListInAllowedBoards(listId: string): Promise<void> {
    const cachedBoardId = this.listBoardCache.get(listId);
    if (cachedBoardId) {
      this.assertBoardAllowed(cachedBoardId, 'List', listId);
      return;
    }

    const response = await this.axiosInstance.get<{ id: string }>(`/lists/${listId}/board`, {
      params: { fields: 'id' },
    });

    this.listBoardCache.set(listId, response.data.id);
    this.assertBoardAllowed(response.data.id, 'List', listId);
  }

  private async assertCardInAllowedBoards(cardId: string): Promise<void> {
    const cachedBoardId = this.cardBoardCache.get(cardId);
    if (cachedBoardId) {
      this.assertBoardAllowed(cachedBoardId, 'Card', cardId);
      return;
    }

    const response = await this.axiosInstance.get<Pick<TrelloCard, 'idBoard'>>(`/cards/${cardId}`, {
      params: { fields: 'idBoard' },
    });

    if (!response.data.idBoard) {
      throw new Error(`Unable to determine board scope for card ${cardId}`);
    }

    this.cardBoardCache.set(cardId, response.data.idBoard);
    this.assertBoardAllowed(response.data.idBoard, 'Card', cardId);
  }

  private async assertChecklistInAllowedBoards(checklistId: string): Promise<void> {
    const cachedBoardId = this.checklistBoardCache.get(checklistId);
    if (cachedBoardId) {
      this.assertBoardAllowed(cachedBoardId, 'Checklist', checklistId);
      return;
    }

    const response = await this.axiosInstance.get<Pick<TrelloChecklist, 'idBoard'>>(
      `/checklists/${checklistId}`,
      {
        params: { fields: 'idBoard' },
      }
    );

    if (!response.data.idBoard) {
      throw new Error(`Unable to determine board scope for checklist ${checklistId}`);
    }

    this.checklistBoardCache.set(checklistId, response.data.idBoard);
    this.assertBoardAllowed(response.data.idBoard, 'Checklist', checklistId);
  }

  private async handleRequest<T>(request: () => Promise<T>, attempt = 0): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          if (attempt >= MAX_429_RETRIES) {
            throw new Error('Trello API rate limit exceeded after repeated retries', {
              cause: error,
            });
          }

          const retryDelay = DEFAULT_RETRY_DELAY_MS * (attempt + 1);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return this.handleRequest(request, attempt + 1);
        }

        const responseMessage =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : undefined;
        const statusCode = error.response?.status;

        if (statusCode) {
          throw new Error(`Trello API error (${statusCode}): ${responseMessage ?? error.message}`, {
            cause: error,
          });
        }

        throw new Error(`Network error calling Trello API: ${error.message}`, {
          cause: error,
        });
      }

      throw error;
    }
  }

  private async searchBoard(
    query: string,
    limit: number,
    boardId: string
  ): Promise<TrelloSearchResults> {
    const response = await this.axiosInstance.get<TrelloSearchResults>('/search', {
      params: {
        query,
        idBoards: boardId,
        modelTypes: 'boards,cards',
        boards_limit: 1,
        cards_limit: limit,
        board_fields: BOARD_FIELDS,
        card_fields: CARD_FIELDS,
      },
    });

    return response.data;
  }

  async getAllowedBoards(): Promise<TrelloBoardSummary[]> {
    return this.handleRequest(async () => {
      const responses = await Promise.all(
        this.getAllowedBoardIds().map(boardId =>
          this.axiosInstance.get<TrelloBoardSummary>(`/boards/${boardId}`, {
            params: { fields: BOARD_FIELDS },
          })
        )
      );

      return responses.map(response => response.data);
    });
  }

  async getCardsByList(listId: string): Promise<TrelloCard[]> {
    return this.handleRequest(async () => {
      await this.assertListInAllowedBoards(listId);
      const response = await this.axiosInstance.get(`/lists/${listId}/cards`);
      return response.data;
    });
  }

  async getLists(boardId?: string): Promise<TrelloList[]> {
    return this.handleRequest(async () => {
      const resolvedBoardId = this.resolveBoardId(boardId);
      const response = await this.axiosInstance.get(`/boards/${resolvedBoardId}/lists`);
      return response.data;
    });
  }

  async getRecentActivity(limit = 10, boardId?: string): Promise<TrelloAction[]> {
    return this.handleRequest(async () => {
      const resolvedBoardId = this.resolveBoardId(boardId);
      const response = await this.axiosInstance.get(`/boards/${resolvedBoardId}/actions`, {
        params: { limit },
      });
      return response.data;
    });
  }

  async addCard(params: {
    listId: string;
    name: string;
    description?: string;
    dueDate?: string;
    labels?: string[];
  }): Promise<TrelloCard> {
    return this.handleRequest(async () => {
      await this.assertListInAllowedBoards(params.listId);
      const response = await this.axiosInstance.post('/cards', {
        idList: params.listId,
        name: params.name,
        desc: params.description,
        due: params.dueDate,
        idLabels: params.labels,
      });
      return response.data;
    });
  }

  async updateCard(params: {
    cardId: string;
    name?: string;
    description?: string;
    dueDate?: string;
    labels?: string[];
  }): Promise<TrelloCard> {
    return this.handleRequest(async () => {
      await this.assertCardInAllowedBoards(params.cardId);
      const response = await this.axiosInstance.put(`/cards/${params.cardId}`, {
        name: params.name,
        desc: params.description,
        due: params.dueDate,
        idLabels: params.labels,
      });
      return response.data;
    });
  }

  async archiveCard(cardId: string): Promise<TrelloCard> {
    return this.handleRequest(async () => {
      await this.assertCardInAllowedBoards(cardId);
      const response = await this.axiosInstance.put(`/cards/${cardId}`, {
        closed: true,
      });
      return response.data;
    });
  }

  async addList(name: string, boardId?: string): Promise<TrelloList> {
    return this.handleRequest(async () => {
      const resolvedBoardId = this.resolveBoardId(boardId);
      const response = await this.axiosInstance.post('/lists', {
        name,
        idBoard: resolvedBoardId,
      });
      return response.data;
    });
  }

  async archiveList(listId: string): Promise<TrelloList> {
    return this.handleRequest(async () => {
      await this.assertListInAllowedBoards(listId);
      const response = await this.axiosInstance.put(`/lists/${listId}/closed`, {
        value: true,
      });
      return response.data;
    });
  }

  async getMyCards(boardId?: string): Promise<TrelloCard[]> {
    return this.handleRequest(async () => {
      const resolvedBoardId = boardId ? this.resolveBoardId(boardId) : undefined;
      const response = await this.axiosInstance.get<TrelloCard[]>('/members/me/cards', {
        params: {
          fields: CARD_FIELDS,
        },
      });

      return response.data.filter(card => {
        if (!card.idBoard) {
          return false;
        }

        if (resolvedBoardId) {
          return card.idBoard === resolvedBoardId;
        }

        return this.allowedBoardIds.has(card.idBoard);
      });
    });
  }

  async searchAllBoards(query: string, limit = 10, boardId?: string): Promise<TrelloSearchResults> {
    return this.handleRequest(async () => {
      const targetBoardIds = boardId ? [this.resolveBoardId(boardId)] : this.getAllowedBoardIds();

      const responses = await Promise.all(
        targetBoardIds.map(targetBoardId => this.searchBoard(query, limit, targetBoardId))
      );

      const boardMap = new Map<string, TrelloBoardSummary>();
      const cards: TrelloCard[] = [];

      for (const response of responses) {
        for (const board of response.boards ?? []) {
          if (this.allowedBoardIds.has(board.id)) {
            boardMap.set(board.id, board);
          }
        }

        for (const card of response.cards ?? []) {
          if (card.idBoard && this.allowedBoardIds.has(card.idBoard)) {
            cards.push(card);
          }
        }
      }

      cards.sort((left, right) => {
        const leftTime = Date.parse(left.dateLastActivity ?? '');
        const rightTime = Date.parse(right.dateLastActivity ?? '');
        return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
      });

      return {
        boards: targetBoardIds
          .map(targetBoardId => boardMap.get(targetBoardId))
          .filter((board): board is TrelloBoardSummary => board !== undefined),
        cards: cards.slice(0, limit),
      };
    });
  }

  async moveCard(cardId: string, listId: string): Promise<TrelloCard> {
    return this.handleRequest(async () => {
      await this.assertCardInAllowedBoards(cardId);
      await this.assertListInAllowedBoards(listId);
      const response = await this.axiosInstance.put(`/cards/${cardId}`, {
        idList: listId,
      });
      return response.data;
    });
  }

  async addComment(cardId: string, text: string): Promise<TrelloAction> {
    return this.handleRequest(async () => {
      await this.assertCardInAllowedBoards(cardId);
      const response = await this.axiosInstance.post(`/cards/${cardId}/actions/comments`, {
        text,
      });
      return response.data;
    });
  }

  async getLabels(boardId?: string): Promise<TrelloLabel[]> {
    return this.handleRequest(async () => {
      const resolvedBoardId = this.resolveBoardId(boardId);
      const response = await this.axiosInstance.get(`/boards/${resolvedBoardId}/labels`);
      return response.data;
    });
  }

  async addLabel(name: string, color: string, boardId?: string): Promise<TrelloLabel> {
    return this.handleRequest(async () => {
      const resolvedBoardId = this.resolveBoardId(boardId);
      const response = await this.axiosInstance.post(`/boards/${resolvedBoardId}/labels`, {
        name,
        color,
      });
      return response.data;
    });
  }

  async getChecklists(cardId: string): Promise<TrelloChecklist[]> {
    return this.handleRequest(async () => {
      await this.assertCardInAllowedBoards(cardId);
      const response = await this.axiosInstance.get(`/cards/${cardId}/checklists`);
      return response.data;
    });
  }

  async createChecklist(cardId: string, name: string): Promise<TrelloChecklist> {
    return this.handleRequest(async () => {
      await this.assertCardInAllowedBoards(cardId);
      const response = await this.axiosInstance.post('/checklists', {
        idCard: cardId,
        name,
      });
      return response.data;
    });
  }

  async addCheckItem(checklistId: string, name: string): Promise<TrelloCheckItem> {
    return this.handleRequest(async () => {
      await this.assertChecklistInAllowedBoards(checklistId);
      const response = await this.axiosInstance.post(`/checklists/${checklistId}/checkItems`, {
        name,
      });
      return response.data;
    });
  }

  async updateCheckItem(
    cardId: string,
    checkItemId: string,
    updates: { name?: string; state?: string }
  ): Promise<TrelloCheckItem> {
    return this.handleRequest(async () => {
      await this.assertCardInAllowedBoards(cardId);
      const response = await this.axiosInstance.put(
        `/cards/${cardId}/checkItem/${checkItemId}`,
        updates
      );
      return response.data;
    });
  }

  async deleteCheckItem(checklistId: string, checkItemId: string): Promise<void> {
    return this.handleRequest(async () => {
      await this.assertChecklistInAllowedBoards(checklistId);
      await this.axiosInstance.delete(`/checklists/${checklistId}/checkItems/${checkItemId}`);
    });
  }

  async getCustomFields(boardId?: string): Promise<TrelloCustomField[]> {
    return this.handleRequest(async () => {
      const resolvedBoardId = this.resolveBoardId(boardId);
      const response = await this.axiosInstance.get(`/boards/${resolvedBoardId}/customFields`);
      return response.data;
    });
  }

  async getCustomFieldItems(cardId: string): Promise<TrelloCustomFieldItem[]> {
    return this.handleRequest(async () => {
      await this.assertCardInAllowedBoards(cardId);
      const response = await this.axiosInstance.get<
        TrelloCard & { customFieldItems: TrelloCustomFieldItem[] }
      >(`/cards/${cardId}`, { params: { customFieldItems: true, fields: 'id' } });
      return response.data.customFieldItems ?? [];
    });
  }

  async setCustomFieldValue(
    cardId: string,
    customFieldId: string,
    body: Record<string, unknown>
  ): Promise<TrelloCustomFieldItem> {
    return this.handleRequest(async () => {
      await this.assertCardInAllowedBoards(cardId);
      const response = await this.axiosInstance.put(
        `/card/${cardId}/customField/${customFieldId}/item`,
        body
      );
      return response.data;
    });
  }

  async getCardAttachments(cardId: string): Promise<TrelloAttachment[]> {
    return this.handleRequest(async () => {
      await this.assertCardInAllowedBoards(cardId);
      const response = await this.axiosInstance.get(`/cards/${cardId}/attachments`);
      return response.data;
    });
  }

  async downloadAttachment(
    cardId: string,
    attachmentId: string
  ): Promise<{
    attachment: TrelloAttachment;
    content: string | null;
    url: string;
    error?: string;
  }> {
    return this.handleRequest(async () => {
      await this.assertCardInAllowedBoards(cardId);

      const metadataResponse = await this.axiosInstance.get(
        `/cards/${cardId}/attachments/${attachmentId}`
      );
      const attachment: TrelloAttachment = metadataResponse.data;

      if (!attachment.isUpload) {
        return {
          attachment,
          content: null,
          url: attachment.url,
        };
      }

      try {
        const contentResponse = await axios.get(attachment.url, {
          responseType: 'arraybuffer',
          maxRedirects: 5,
          timeout: 60000,
          maxContentLength: 5 * 1024 * 1024,
          headers: {
            Accept: '*/*',
            Authorization: `OAuth oauth_consumer_key="${this.config.apiKey}", oauth_token="${this.config.token}"`,
          },
        });

        const base64Content = Buffer.from(contentResponse.data).toString('base64');

        return {
          attachment,
          content: base64Content,
          url: attachment.url,
        };
      } catch (error) {
        let errorMessage = 'Unknown error';
        if (axios.isAxiosError(error)) {
          if (error.response) {
            errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
          } else if (error.code) {
            errorMessage = `Network error: ${error.code} - ${error.message}`;
          } else {
            errorMessage = error.message;
          }
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        console.error('Failed to download attachment content:', errorMessage);

        return {
          attachment,
          content: null,
          url: attachment.url,
          error: `Download failed: ${errorMessage}`,
        };
      }
    });
  }

  async getBoardMembers(boardId?: string): Promise<TrelloMember[]> {
    return this.handleRequest(async () => {
      const resolvedBoardId = this.resolveBoardId(boardId);
      const response = await this.axiosInstance.get(`/boards/${resolvedBoardId}/members`);
      return response.data;
    });
  }

  async assignCardMember(cardId: string, memberId: string): Promise<TrelloMember[]> {
    return this.handleRequest(async () => {
      await this.assertCardInAllowedBoards(cardId);
      const response = await this.axiosInstance.post(`/cards/${cardId}/idMembers`, {
        value: memberId,
      });
      return response.data;
    });
  }

  async unassignCardMember(cardId: string, memberId: string): Promise<void> {
    return this.handleRequest(async () => {
      await this.assertCardInAllowedBoards(cardId);
      await this.axiosInstance.delete(`/cards/${cardId}/idMembers/${memberId}`);
    });
  }

  async deleteComment(cardId: string, actionId: string): Promise<void> {
    return this.handleRequest(async () => {
      await this.assertCardInAllowedBoards(cardId);
      await this.axiosInstance.delete(`/cards/${cardId}/actions/${actionId}/comments`);
    });
  }
}
