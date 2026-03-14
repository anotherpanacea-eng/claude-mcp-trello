export interface TrelloConfig {
  apiKey: string;
  token: string;
  boardId: string;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  due: string | null;
  idBoard?: string;
  idList: string;
  idLabels: string[];
  closed: boolean;
  url: string;
  dateLastActivity: string;
}

export interface TrelloList {
  id: string;
  name: string;
  closed: boolean;
  idBoard: string;
  pos: number;
}

export interface TrelloAction {
  id: string;
  idMemberCreator: string;
  type: string;
  date: string;
  data: {
    text?: string;
    card?: {
      id: string;
      name: string;
    };
    list?: {
      id: string;
      name: string;
    };
    board: {
      id: string;
      name: string;
    };
  };
  memberCreator: {
    id: string;
    fullName: string;
    username: string;
  };
}

export interface TrelloLabel {
  id: string;
  name: string;
  color: string;
}

export interface TrelloBoardSearchResult {
  id: string;
  name: string;
  url: string;
}

export interface TrelloSearchResults {
  boards: TrelloBoardSearchResult[];
  cards: TrelloCard[];
}

export interface TrelloMember {
  id: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
}

export interface TrelloChecklist {
  id: string;
  name: string;
  idBoard: string;
  idCard: string;
  pos: number;
  checkItems: TrelloCheckItem[];
}

export interface TrelloCheckItem {
  id: string;
  name: string;
  state: 'complete' | 'incomplete';
  pos: number;
  idChecklist: string;
}

export interface TrelloCustomField {
  id: string;
  idModel: string;
  modelType: string;
  name: string;
  type: 'text' | 'number' | 'checkbox' | 'date' | 'list';
  pos: number;
  options?: TrelloCustomFieldOption[];
}

export interface TrelloCustomFieldOption {
  id: string;
  value: { text: string };
  color: string;
  pos: number;
}

export interface TrelloCustomFieldItem {
  id: string;
  idCustomField: string;
  idModel: string;
  modelType: string;
  idValue?: string;
  value?: {
    text?: string;
    number?: string;
    date?: string;
    checked?: string;
  };
}

export interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
  bytes: number;
  mimeType: string;
  date: string;
  idMember: string;
  isUpload: boolean;
  fileName: string;
}

export interface RateLimiter {
  canMakeRequest(): boolean;
  waitForAvailableToken(): Promise<void>;
}
