export interface Market {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  createdAt: string;
}

export interface CategoryMarket {
  id: string;
  categoryId: string;
  marketId: string;
}

export interface Item {
  id: string;
  name: string;
  categoryId: string;
  stock: number;
  unit: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  name: string;
  pin: string; // Stored as 4-digit text, e.g. "0000"
  role: number; // 0 = Regular user, 1 = Admin
  status: 'ACTIVE' | 'INACTIVE';
  assignedMarketIds?: string[]; // Allowed markets, empty means all or specified
  createdAt: string;
}

export interface OrderItem {
  itemId: string;
  itemName: string;
  categoryName: string;
  stockAtOrder: number; // คงเหลือตอนสั่ง
  quantity: number;     // สั่ง (จำนวนเดี่ยว)
  unit: string;         // หน่วย
}

export interface Order {
  id: string; // Order Number, e.g. HPP-20260930-001
  marketId: string;
  marketName: string;
  userId: string;
  userName: string;
  createdAt: string;
  items: OrderItem[];
  note?: string;
  status: 'COMPLETED' | 'CANCELLED';
}

export interface SheetConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  isCustom: boolean;
}

export interface NotificationToast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}
