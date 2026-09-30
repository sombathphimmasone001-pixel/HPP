// Google Sheets API client helper using access_token

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3/files';

export interface SheetMetadata {
  id: string;
  title: string;
  url: string;
}

export const REQUIRED_SHEETS = [
  'Markets',
  'Categories',
  'CategoryMarkets',
  'Items',
  'Users',
  'Orders',
  'OrderItems',
  'Settings',
  'History'
];

export const SHEET_HEADERS: Record<string, string[]> = {
  Markets: ['id', 'name', 'description', 'createdAt'],
  Categories: ['id', 'name', 'createdAt'],
  CategoryMarkets: ['id', 'categoryId', 'marketId'],
  Items: ['id', 'name', 'categoryId', 'stock', 'unit', 'updatedAt'],
  Users: ['id', 'name', 'pin', 'role', 'status', 'assignedMarkets', 'createdAt'],
  Orders: ['id', 'marketId', 'marketName', 'userId', 'userName', 'createdAt', 'itemCount', 'note', 'status'],
  OrderItems: ['orderId', 'itemId', 'itemName', 'categoryName', 'stockAtOrder', 'quantity', 'unit'],
  Settings: ['key', 'value', 'updatedAt'],
  History: ['id', 'action', 'details', 'userId', 'userName', 'createdAt']
};

export class GoogleSheetsClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const message = errBody?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      throw new Error(message);
    }

    return res.json();
  }

  // Create a new spreadsheet with the required sheets and headers
  async createHPPSpreadsheet(title = 'HPP Order & Inventory Database'): Promise<SheetMetadata> {
    const sheets = REQUIRED_SHEETS.map(title => ({
      properties: { title }
    }));

    const body = {
      properties: { title },
      sheets
    };

    const res = await this.fetchWithAuth(SHEETS_BASE, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const spreadsheetId = res.spreadsheetId;
    const spreadsheetUrl = res.spreadsheetUrl;

    // Populate headers for each sheet
    const data = REQUIRED_SHEETS.map(sheetName => ({
      range: `'${sheetName}'!A1:Z1`,
      values: [SHEET_HEADERS[sheetName]]
    }));

    await this.fetchWithAuth(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data
      })
    });

    return {
      id: spreadsheetId,
      title,
      url: spreadsheetUrl
    };
  }

  // Ensure that all required sheets exist in an existing spreadsheet
  async verifyAndInitExistingSpreadsheet(spreadsheetId: string): Promise<void> {
    const meta = await this.fetchWithAuth(`${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties.title`);
    const existingTitles: string[] = (meta.sheets || []).map((s: any) => s.properties.title);

    const missingSheets = REQUIRED_SHEETS.filter(s => !existingTitles.includes(s));
    if (missingSheets.length > 0) {
      const requests = missingSheets.map(title => ({
        addSheet: {
          properties: { title }
        }
      }));

      await this.fetchWithAuth(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests })
      });

      // Write headers for new sheets
      const data = missingSheets.map(sheetName => ({
        range: `'${sheetName}'!A1:Z1`,
        values: [SHEET_HEADERS[sheetName]]
      }));

      await this.fetchWithAuth(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data
        })
      });
    }
  }

  // Fetch all rows from a sheet
  async getSheetValues(spreadsheetId: string, sheetName: string): Promise<string[][]> {
    try {
      const encodedRange = encodeURIComponent(`'${sheetName}'!A1:Z`);
      const res = await this.fetchWithAuth(`${SHEETS_BASE}/${spreadsheetId}/values/${encodedRange}`);
      return res.values || [];
    } catch (err: any) {
      console.warn(`Failed to read sheet ${sheetName}:`, err);
      return [];
    }
  }

  // Batch get all required sheets
  async getAllData(spreadsheetId: string): Promise<Record<string, string[][]>> {
    const ranges = REQUIRED_SHEETS.map(s => `'${s}'!A1:Z`).map(encodeURIComponent).join('&ranges=');
    const res = await this.fetchWithAuth(`${SHEETS_BASE}/${spreadsheetId}/values:batchGet?ranges=${ranges}`);
    const results: Record<string, string[][]> = {};

    (res.valueRanges || []).forEach((vr: any, idx: number) => {
      const sheetName = REQUIRED_SHEETS[idx];
      results[sheetName] = vr.values || [];
    });

    return results;
  }

  // Overwrite entire sheet values (preserving header)
  async overwriteSheet(spreadsheetId: string, sheetName: string, rows: (string | number)[][]): Promise<void> {
    const header = SHEET_HEADERS[sheetName];
    const fullValues = [header, ...rows];

    // Clear first
    const encodedRange = encodeURIComponent(`'${sheetName}'!A1:Z`);
    await this.fetchWithAuth(`${SHEETS_BASE}/${spreadsheetId}/values/${encodedRange}:clear`, {
      method: 'POST',
      body: JSON.stringify({})
    });

    // Write all
    await this.fetchWithAuth(`${SHEETS_BASE}/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({
        range: `'${sheetName}'!A1`,
        values: fullValues
      })
    });
  }

  // Append rows to a sheet
  async appendRows(spreadsheetId: string, sheetName: string, rows: (string | number)[][]): Promise<void> {
    if (rows.length === 0) return;
    const encodedRange = encodeURIComponent(`'${sheetName}'!A1`);
    await this.fetchWithAuth(`${SHEETS_BASE}/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({
        values: rows
      })
    });
  }

  // List user's recent HPP spreadsheets from Drive
  async listHPPSpreadsheets(): Promise<SheetMetadata[]> {
    try {
      const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
      const res = await this.fetchWithAuth(`${DRIVE_BASE}?q=${q}&orderBy=modifiedTime desc&pageSize=20&fields=files(id,name,webViewLink)`);
      return (res.files || []).map((f: any) => ({
        id: f.id,
        title: f.name,
        url: f.webViewLink || `https://docs.google.com/spreadsheets/d/${f.id}/edit`
      }));
    } catch (err) {
      console.warn('Could not list drive files:', err);
      return [];
    }
  }
}
