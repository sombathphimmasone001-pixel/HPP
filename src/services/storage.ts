import { Market, Category, CategoryMarket, Item, User, Order, OrderItem } from '../types';
import { GoogleSheetsClient } from './googleSheets';

const LOCAL_STORAGE_KEYS = {
  MARKETS: 'hpp_data_markets',
  CATEGORIES: 'hpp_data_categories',
  CATEGORY_MARKETS: 'hpp_data_category_markets',
  ITEMS: 'hpp_data_items',
  USERS: 'hpp_data_users',
  ORDERS: 'hpp_data_orders',
  SESSION_USER: 'hpp_session_user',
  GOOGLE_TOKEN: 'hpp_google_token',
  SHEET_CONFIG: 'hpp_sheet_config',
  INITIALIZED_ADMIN: 'hpp_admin_initialized'
};

// Default Admin user (must have PIN '0000', Role 1, Status ACTIVE)
export const DEFAULT_ADMIN: User = {
  id: 'usr_admin',
  name: 'ผู้ดูแลระบบ (Admin)',
  pin: '0000',
  role: 1,
  status: 'ACTIVE',
  createdAt: new Date().toISOString()
};

export class StorageService {
  private sheetsClient: GoogleSheetsClient | null = null;
  private spreadsheetId: string | null = null;

  constructor() {
    this.initTokenFromStorage();
  }

  initTokenFromStorage() {
    const token = localStorage.getItem(LOCAL_STORAGE_KEYS.GOOGLE_TOKEN);
    const sheetCfgStr = localStorage.getItem(LOCAL_STORAGE_KEYS.SHEET_CONFIG);
    if (token) {
      this.sheetsClient = new GoogleSheetsClient(token);
    }
    if (sheetCfgStr) {
      try {
        const cfg = JSON.parse(sheetCfgStr);
        this.spreadsheetId = cfg.spreadsheetId || null;
      } catch (e) {
        console.error(e);
      }
    }
  }

  setToken(token: string | null) {
    if (token) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.GOOGLE_TOKEN, token);
      this.sheetsClient = new GoogleSheetsClient(token);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEYS.GOOGLE_TOKEN);
      this.sheetsClient = null;
    }
  }

  getToken(): string | null {
    return localStorage.getItem(LOCAL_STORAGE_KEYS.GOOGLE_TOKEN);
  }

  setSpreadsheetId(id: string | null, url?: string, title?: string) {
    this.spreadsheetId = id;
    if (id) {
      const cfg = {
        spreadsheetId: id,
        spreadsheetUrl: url || `https://docs.google.com/spreadsheets/d/${id}/edit`,
        spreadsheetTitle: title || 'HPP Database',
        isCustom: true
      };
      localStorage.setItem(LOCAL_STORAGE_KEYS.SHEET_CONFIG, JSON.stringify(cfg));
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEYS.SHEET_CONFIG);
    }
  }

  getSpreadsheetConfig() {
    const str = localStorage.getItem(LOCAL_STORAGE_KEYS.SHEET_CONFIG);
    return str ? JSON.parse(str) : null;
  }

  isSheetsConnected(): boolean {
    return !!(this.sheetsClient && this.spreadsheetId);
  }

  // --- LOCAL CACHE HELPERS (Instant response, no delays) ---
  getMarketsLocal(): Market[] {
    const s = localStorage.getItem(LOCAL_STORAGE_KEYS.MARKETS);
    return s ? JSON.parse(s) : [];
  }

  saveMarketsLocal(markets: Market[]) {
    localStorage.setItem(LOCAL_STORAGE_KEYS.MARKETS, JSON.stringify(markets));
  }

  getCategoriesLocal(): Category[] {
    const s = localStorage.getItem(LOCAL_STORAGE_KEYS.CATEGORIES);
    return s ? JSON.parse(s) : [];
  }

  saveCategoriesLocal(cats: Category[]) {
    localStorage.setItem(LOCAL_STORAGE_KEYS.CATEGORIES, JSON.stringify(cats));
  }

  getCategoryMarketsLocal(): CategoryMarket[] {
    const s = localStorage.getItem(LOCAL_STORAGE_KEYS.CATEGORY_MARKETS);
    return s ? JSON.parse(s) : [];
  }

  saveCategoryMarketsLocal(cms: CategoryMarket[]) {
    localStorage.setItem(LOCAL_STORAGE_KEYS.CATEGORY_MARKETS, JSON.stringify(cms));
  }

  getItemsLocal(): Item[] {
    const s = localStorage.getItem(LOCAL_STORAGE_KEYS.ITEMS);
    return s ? JSON.parse(s) : [];
  }

  saveItemsLocal(items: Item[]) {
    localStorage.setItem(LOCAL_STORAGE_KEYS.ITEMS, JSON.stringify(items));
  }

  getUsersLocal(): User[] {
    const s = localStorage.getItem(LOCAL_STORAGE_KEYS.USERS);
    if (!s) {
      // First time initialization: Admin only!
      const initial = [DEFAULT_ADMIN];
      localStorage.setItem(LOCAL_STORAGE_KEYS.USERS, JSON.stringify(initial));
      return initial;
    }
    try {
      const users: User[] = JSON.parse(s);
      // Ensure admin exists
      if (!users.some(u => u.pin === '0000' || u.role === 1)) {
        users.unshift(DEFAULT_ADMIN);
        localStorage.setItem(LOCAL_STORAGE_KEYS.USERS, JSON.stringify(users));
      }
      return users;
    } catch {
      return [DEFAULT_ADMIN];
    }
  }

  saveUsersLocal(users: User[]) {
    // Always preserve string PIN and 4 digits (e.g. '0000')
    const sanitized = users.map(u => ({
      ...u,
      pin: String(u.pin).padStart(4, '0')
    }));
    localStorage.setItem(LOCAL_STORAGE_KEYS.USERS, JSON.stringify(sanitized));
  }

  getOrdersLocal(): Order[] {
    const s = localStorage.getItem(LOCAL_STORAGE_KEYS.ORDERS);
    return s ? JSON.parse(s) : [];
  }

  saveOrdersLocal(orders: Order[]) {
    localStorage.setItem(LOCAL_STORAGE_KEYS.ORDERS, JSON.stringify(orders));
  }

  // Session
  getSessionUser(): User | null {
    const s = localStorage.getItem(LOCAL_STORAGE_KEYS.SESSION_USER);
    return s ? JSON.parse(s) : null;
  }

  setSessionUser(user: User | null) {
    if (user) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.SESSION_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEYS.SESSION_USER);
    }
  }

  // --- GOOGLE SHEETS SYNC (Async, background or immediate) ---
  
  // Format PIN for Google Sheets: prepending "'" ensures sheet treats "0000" as text, not 0
  private formatPinForSheet(pin: string): string {
    const p = String(pin).padStart(4, '0');
    return `'${p}`;
  }

  private parsePinFromSheet(val: any): string {
    if (!val) return '0000';
    let s = String(val).trim();
    if (s.startsWith("'")) s = s.slice(1);
    return s.padStart(4, '0');
  }

  async syncAllFromSheets(): Promise<boolean> {
    if (!this.sheetsClient || !this.spreadsheetId) return false;

    try {
      const data = await this.sheetsClient.getAllData(this.spreadsheetId);

      // 1. Markets
      if (data.Markets && data.Markets.length > 1) {
        const rows = data.Markets.slice(1);
        const markets: Market[] = rows.filter(r => r[0] && r[1]).map(r => ({
          id: r[0],
          name: r[1],
          description: r[2] || '',
          createdAt: r[3] || new Date().toISOString()
        }));
        this.saveMarketsLocal(markets);
      }

      // 2. Categories
      if (data.Categories && data.Categories.length > 1) {
        const rows = data.Categories.slice(1);
        const cats: Category[] = rows.filter(r => r[0] && r[1]).map(r => ({
          id: r[0],
          name: r[1],
          createdAt: r[2] || new Date().toISOString()
        }));
        this.saveCategoriesLocal(cats);
      }

      // 3. CategoryMarkets
      if (data.CategoryMarkets && data.CategoryMarkets.length > 1) {
        const rows = data.CategoryMarkets.slice(1);
        const cms: CategoryMarket[] = rows.filter(r => r[0] && r[1] && r[2]).map(r => ({
          id: r[0],
          categoryId: r[1],
          marketId: r[2]
        }));
        this.saveCategoryMarketsLocal(cms);
      }

      // 4. Items
      if (data.Items && data.Items.length > 1) {
        const rows = data.Items.slice(1);
        const items: Item[] = rows.filter(r => r[0] && r[1]).map(r => ({
          id: r[0],
          name: r[1],
          categoryId: r[2] || '',
          stock: Number(r[3]) || 0,
          unit: r[4] || 'ชิ้น',
          updatedAt: r[5] || new Date().toISOString()
        }));
        this.saveItemsLocal(items);
      }

      // 5. Users
      if (data.Users && data.Users.length > 1) {
        const rows = data.Users.slice(1);
        const users: User[] = rows.filter(r => r[0] && r[1]).map(r => ({
          id: r[0],
          name: r[1],
          pin: this.parsePinFromSheet(r[2]),
          role: Number(r[3]) || 0,
          status: (r[4] === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE') as any,
          assignedMarketIds: r[5] ? r[5].split(',').filter(Boolean) : [],
          createdAt: r[6] || new Date().toISOString()
        }));

        // Guarantee Admin 0000 exists
        if (!users.some(u => u.pin === '0000' && u.role === 1)) {
          users.unshift(DEFAULT_ADMIN);
          // Sync Admin back to Sheets asynchronously
          this.syncUsersToSheets(users).catch(console.error);
        }
        this.saveUsersLocal(users);
      } else {
        // If sheet is empty of users, write default admin
        const initial = [DEFAULT_ADMIN];
        this.saveUsersLocal(initial);
        await this.syncUsersToSheets(initial);
      }

      // 6. Orders and OrderItems
      if (data.Orders && data.Orders.length > 1) {
        const orderRows = data.Orders.slice(1);
        const itemRows = (data.OrderItems && data.OrderItems.length > 1) ? data.OrderItems.slice(1) : [];

        const itemsByOrderId: Record<string, OrderItem[]> = {};
        itemRows.forEach(r => {
          const orderId = r[0];
          if (!orderId) return;
          if (!itemsByOrderId[orderId]) itemsByOrderId[orderId] = [];
          itemsByOrderId[orderId].push({
            itemId: r[1] || '',
            itemName: r[2] || '',
            categoryName: r[3] || '',
            stockAtOrder: Number(r[4]) || 0,
            quantity: Number(r[5]) || 0,
            unit: r[6] || 'ชิ้น'
          });
        });

        const orders: Order[] = orderRows.filter(r => r[0]).map(r => ({
          id: r[0],
          marketId: r[1] || '',
          marketName: r[2] || '',
          userId: r[3] || '',
          userName: r[4] || '',
          createdAt: r[5] || new Date().toISOString(),
          note: r[7] || '',
          status: (r[8] === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED') as any,
          items: itemsByOrderId[r[0]] || []
        }));

        this.saveOrdersLocal(orders);
      }

      return true;
    } catch (err) {
      console.error('Failed to sync all from sheets:', err);
      return false;
    }
  }

  // Write changes directly to Google Sheets
  async syncMarketsToSheets(markets: Market[]): Promise<void> {
    if (!this.sheetsClient || !this.spreadsheetId) return;
    const rows = markets.map(m => [m.id, m.name, m.description || '', m.createdAt]);
    await this.sheetsClient.overwriteSheet(this.spreadsheetId, 'Markets', rows);
  }

  async syncCategoriesToSheets(categories: Category[]): Promise<void> {
    if (!this.sheetsClient || !this.spreadsheetId) return;
    const rows = categories.map(c => [c.id, c.name, c.createdAt]);
    await this.sheetsClient.overwriteSheet(this.spreadsheetId, 'Categories', rows);
  }

  async syncCategoryMarketsToSheets(cms: CategoryMarket[]): Promise<void> {
    if (!this.sheetsClient || !this.spreadsheetId) return;
    const rows = cms.map(cm => [cm.id, cm.categoryId, cm.marketId]);
    await this.sheetsClient.overwriteSheet(this.spreadsheetId, 'CategoryMarkets', rows);
  }

  async syncItemsToSheets(items: Item[]): Promise<void> {
    if (!this.sheetsClient || !this.spreadsheetId) return;
    const rows = items.map(i => [i.id, i.name, i.categoryId, i.stock, i.unit, i.updatedAt || '']);
    await this.sheetsClient.overwriteSheet(this.spreadsheetId, 'Items', rows);
  }

  async syncUsersToSheets(users: User[]): Promise<void> {
    if (!this.sheetsClient || !this.spreadsheetId) return;
    const rows = users.map(u => [
      u.id,
      u.name,
      this.formatPinForSheet(u.pin),
      u.role,
      u.status,
      (u.assignedMarketIds || []).join(','),
      u.createdAt
    ]);
    await this.sheetsClient.overwriteSheet(this.spreadsheetId, 'Users', rows);
  }

  async appendOrderToSheets(order: Order): Promise<void> {
    if (!this.sheetsClient || !this.spreadsheetId) return;
    const orderRow = [
      order.id,
      order.marketId,
      order.marketName,
      order.userId,
      order.userName,
      order.createdAt,
      order.items.length,
      order.note || '',
      order.status
    ];
    await this.sheetsClient.appendRows(this.spreadsheetId, 'Orders', [orderRow]);

    const itemRows = order.items.map(it => [
      order.id,
      it.itemId,
      it.itemName,
      it.categoryName,
      it.stockAtOrder,
      it.quantity,
      it.unit
    ]);
    await this.sheetsClient.appendRows(this.spreadsheetId, 'OrderItems', itemRows);
  }
}

export const storage = new StorageService();
