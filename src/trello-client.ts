import axios, { AxiosInstance } from 'axios';
import {
  TrelloAction,
  TrelloCard,
  TrelloConfig,
  TrelloList,
  TrelloSearchResults,
} from './types.js';
import { createTrelloRateLimiters } from './rate-limiter.js';

const MAX_429_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

export class TrelloClient {
  private axiosInstance: AxiosInstance;
  private rateLimiter;
  private listBoardCache = new Map<string, string>();
  private cardBoardCache = new Map<string, string>();

  constructor(private config: TrelloConfig) {
    this.axiosInstance = axios.create({
      baseURL: 'https://api.trello.com/1',
      timeout: 30000,
      maxContentLength: 5 * 1024 * 1024, // 5MB response limit
      maxBodyLength: 1 * 1024 * 1024, // 1MB request limit
      params: {
        key: config.apiKey,
        token: config.token,
      },
    });

    this.rateLimiter = createTrelloRateLimiters();

    // Add rate limiting interceptor
    this.axiosInstance.interceptors.request.use(async config => {
      await this.rateLimiter.waitForAvailable();
      return config;
    });
  }

  private assertBoardScope(boardId: string, resourceType: string, resourceId: string): void {
    if (boardId !== this.config.boardId) {
      throw new Error(`${resourceType} ${resourceId} is outside the configured board scope`);
    }
  }

  private async assertListInConfiguredBoard(listId: string): Promise<void> {
    const cachedBoardId = this.listBoardCache.get(listId);
    if (cachedBoardId) {
      this.assertBoardScope(cachedBoardId, 'List', listId);
      return;
    }

    const response = await this.axiosInstance.get<{ id: string }>(`/lists/${listId}/board`, {
      params: { fields: 'id' },
    });

    this.listBoardCache.set(listId, response.data.id);
    this.assertBoardScope(response.data.id, 'List', listId);
  }

  private async assertCardInConfiguredBoard(cardId: string): Promise<void> {
    const cachedBoardId = this.cardBoardCache.get(cardId);
    if (cachedBoardId) {
      this.assertBoardScope(cachedBoardId, 'Card', cardId);
      return;
    }

    const response = await this.axiosInstance.get<Pick<TrelloCard, 'idBoard'>>(`/cards/${cardId}`, {
      params: { fields: 'idBoard' },
    });

    if (!response.data.idBoard) {
      throw new Error(`Unable to determine board scope for card ${cardId}`);
    }

    this.cardBoardCache.set(cardId, response.data.idBoard);
    this.assertBoardScope(response.data.idBoard, 'Card', cardId);
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

  async getCardsByList(listId: string): Promise<TrelloCard[]> {
    return this.handleRequest(async () => {
      await this.assertListInConfiguredBoard(listId);
      const response = await this.axiosInstance.get(`/lists/${listId}/cards`);
      return response.data;
    });
  }

  async getLists(): Promise<TrelloList[]> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.get(`/boards/${this.config.boardId}/lists`);
      return response.data;
    });
  }

  async getRecentActivity(limit: number = 10): Promise<TrelloAction[]> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.get(`/boards/${this.config.boardId}/actions`, {
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
      await this.assertListInConfiguredBoard(params.listId);
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
      await this.assertCardInConfiguredBoard(params.cardId);
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
      await this.assertCardInConfiguredBoard(cardId);
      const response = await this.axiosInstance.put(`/cards/${cardId}`, {
        closed: true,
      });
      return response.data;
    });
  }

  async addList(name: string): Promise<TrelloList> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.post('/lists', {
        name,
        idBoard: this.config.boardId,
      });
      return response.data;
    });
  }

  async archiveList(listId: string): Promise<TrelloList> {
    return this.handleRequest(async () => {
      await this.assertListInConfiguredBoard(listId);
      const response = await this.axiosInstance.put(`/lists/${listId}/closed`, {
        value: true,
      });
      return response.data;
    });
  }

  async getMyCards(): Promise<TrelloCard[]> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.get<TrelloCard[]>('/members/me/cards', {
        params: {
          fields: 'id,name,desc,due,idBoard,idList,idLabels,closed,url,dateLastActivity',
        },
      });

      return response.data.filter(card => card.idBoard === this.config.boardId);
    });
  }

  async searchAllBoards(query: string, limit: number = 10): Promise<TrelloSearchResults> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.get<TrelloSearchResults>('/search', {
        params: {
          query,
          idBoards: this.config.boardId,
          modelTypes: 'boards,cards',
          boards_limit: 1,
          cards_limit: limit,
          board_fields: 'id,name,url',
          card_fields: 'id,name,desc,due,idBoard,idList,idLabels,closed,url,dateLastActivity',
        },
      });
      return response.data;
    });
  }
}
