import axios, { AxiosInstance } from 'axios';
import { TrelloConfig, TrelloCard, TrelloList, TrelloAction } from './types.js';
import { createTrelloRateLimiters } from './rate-limiter.js';

export class TrelloClient {
  private axiosInstance: AxiosInstance;
  private rateLimiter;

  constructor(private config: TrelloConfig) {
    this.axiosInstance = axios.create({
      baseURL: 'https://api.trello.com/1',
      params: {
        key: config.apiKey,
        token: config.token,
      },
    });

    this.rateLimiter = createTrelloRateLimiters();

    // Add rate limiting interceptor
    this.axiosInstance.interceptors.request.use(async (config) => {
      await this.rateLimiter.waitForAvailable();
      return config;
    });
  }

  private static readonly MAX_RETRIES = 3;

  private async handleRequest<T>(request: () => Promise<T>, retries = 0): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          if (retries >= TrelloClient.MAX_RETRIES) {
            throw new Error('Trello API rate limit exceeded after maximum retries');
          }
          // Rate limit exceeded, wait with exponential backoff and retry
          const delay = 1000 * Math.pow(2, retries);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.handleRequest(request, retries + 1);
        }
        throw new Error(`Trello API error: ${error.response?.data?.message ?? error.message}`);
      }
      throw error;
    }
  }

  private async verifyListBelongsToBoard(listId: string): Promise<void> {
    const response = await this.axiosInstance.get(`/lists/${listId}`, {
      params: { fields: 'idBoard' },
    });
    if (response.data.idBoard !== this.config.boardId) {
      throw new Error(`List ${listId} does not belong to the configured board`);
    }
  }

  private async verifyCardBelongsToBoard(cardId: string): Promise<void> {
    const response = await this.axiosInstance.get(`/cards/${cardId}`, {
      params: { fields: 'idBoard' },
    });
    if (response.data.idBoard !== this.config.boardId) {
      throw new Error(`Card ${cardId} does not belong to the configured board`);
    }
  }

  async getCardsByList(listId: string): Promise<TrelloCard[]> {
    return this.handleRequest(async () => {
      await this.verifyListBelongsToBoard(listId);
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
      await this.verifyListBelongsToBoard(params.listId);
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
      await this.verifyCardBelongsToBoard(params.cardId);
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
      await this.verifyCardBelongsToBoard(cardId);
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
      await this.verifyListBelongsToBoard(listId);
      const response = await this.axiosInstance.put(`/lists/${listId}/closed`, {
        value: true,
      });
      return response.data;
    });
  }

  async getMyCards(): Promise<TrelloCard[]> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.get('/members/me/cards');
      return (response.data as TrelloCard[]).filter(
        (card) => card.idBoard === this.config.boardId
      );
    });
  }

  async searchBoard(query: string, limit: number = 10): Promise<any> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.get('/search', {
        params: {
          query,
          idBoards: this.config.boardId,
          modelTypes: 'all',
          boards_limit: limit,
          cards_limit: limit,
        },
      });
      return response.data;
    });
  }
}
