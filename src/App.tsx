import React, { useState, useEffect, useCallback } from 'react';
import { 
  Market, 
  Category, 
  CategoryMarket, 
  Item, 
  User, 
  Order, 
  OrderItem, 
  NotificationToast 
} from './types';
import { storage, DEFAULT_ADMIN } from './services/storage';
import { GoogleSheetsClient } from './services/googleSheets';
import { LoginScreen } from './components/LoginScreen';
import { OrderView } from './components/OrderView';
import { OrderHistoryView } from './components/OrderHistoryView';
import { AdminManageView } from './components/AdminManageView';
import { ToastContainer } from './components/Toast';
import { 
  ShoppingCart, 
  ClipboardList, 
  Settings, 
  LogOut, 
  User as UserIcon, 
  Database, 
  Check, 
  Store
} from 'lucide-react';

export default function App() {
  // Authentication & Session
  const [currentUser, setCurrentUser] = useState<User | null>(() => storage.getSessionUser());

  // Master Data state initialized from cache (instant, zero delay)
  const [markets, setMarkets] = useState<Market[]>(() => storage.getMarketsLocal());
  const [categories, setCategories] = useState<Category[]>(() => storage.getCategoriesLocal());
  const [categoryMarkets, setCategoryMarkets] = useState<CategoryMarket[]>(() => storage.getCategoryMarketsLocal());
  const [items, setItems] = useState<Item[]>(() => storage.getItemsLocal());
  const [users, setUsers] = useState<User[]>(() => storage.getUsersLocal());
  const [orders, setOrders] = useState<Order[]>(() => storage.getOrdersLocal());

  // Navigation
  const [currentTab, setCurrentTab] = useState<'order' | 'history' | 'admin'>('order');

  // Async States
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [spreadsheetConfig, setSpreadsheetConfig] = useState<any>(() => storage.getSpreadsheetConfig());

  // Notification Toasts
  const [toasts, setToasts] = useState<NotificationToast[]>([]);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Sync with Google Sheets upon startup or background
  const initGoogleSheetsDatabase = useCallback(async () => {
    // If OAuth token exists, verify or create the master spreadsheet
    const token = storage.getToken();
    if (!token) return;

    try {
      setIsSyncingSheets(true);
      const client = new GoogleSheetsClient(token);
      let cfg = storage.getSpreadsheetConfig();

      if (!cfg || !cfg.spreadsheetId) {
        // Auto create HPP Order Database in Google Sheets
        const newSheet = await client.createHPPSpreadsheet('HPP Order & Inventory Database');
        storage.setSpreadsheetId(newSheet.id, newSheet.url, newSheet.title);
        setSpreadsheetConfig(storage.getSpreadsheetConfig());
        // Write initial default admin to ensure Users table is ready
        await storage.syncUsersToSheets(users);
      } else {
        await client.verifyAndInitExistingSpreadsheet(cfg.spreadsheetId);
        // Pull latest
        const ok = await storage.syncAllFromSheets();
        if (ok) {
          setMarkets(storage.getMarketsLocal());
          setCategories(storage.getCategoriesLocal());
          setCategoryMarkets(storage.getCategoryMarketsLocal());
          setItems(storage.getItemsLocal());
          setUsers(storage.getUsersLocal());
          setOrders(storage.getOrdersLocal());
        }
      }
    } catch (err) {
      console.warn('Google Sheets auto-connect notice:', err);
    } finally {
      setIsSyncingSheets(false);
    }
  }, [users]);

  useEffect(() => {
    initGoogleSheetsDatabase();
  }, [initGoogleSheetsDatabase]);

  // Session Login
  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    storage.setSessionUser(user);
    showToast('success', `ยินดีต้อนรับคุณ ${user.name}`);
    // If regular user, default to order tab; if admin, allow order or admin
    setCurrentTab('order');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    storage.setSessionUser(null);
    showToast('info', 'ออกจากระบบเรียบร้อยแล้ว');
  };

  // --- ACTIONS WITH SHEETS & CACHE SYNC ---

  // 1. Submit Order
  const handleSubmitOrder = async (orderData: {
    marketId: string;
    marketName: string;
    items: OrderItem[];
    note?: string;
  }) => {
    if (!currentUser) return;
    if (isSubmittingOrder) return; // Prevent double submission
    setIsSubmittingOrder(true);

    try {
      // Generate Order ID: HPP-YYYYMMDD-XXX
      const now = new Date();
      const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
      const dayOrdersCount = orders.filter(o => o.createdAt.startsWith(now.toISOString().slice(0, 10))).length;
      const orderNumber = `HPP-${datePart}-${String(dayOrdersCount + 1).padStart(3, '0')}`;

      const newOrder: Order = {
        id: orderNumber,
        marketId: orderData.marketId,
        marketName: orderData.marketName,
        userId: currentUser.id,
        userName: currentUser.name,
        createdAt: now.toISOString(),
        items: orderData.items,
        note: orderData.note,
        status: 'COMPLETED'
      };

      // Deduct stock from local items
      const updatedItems = items.map(it => {
        const ordered = orderData.items.find(oi => oi.itemId === it.id);
        if (ordered) {
          return {
            ...it,
            stock: Math.max(0, it.stock - ordered.quantity),
            updatedAt: now.toISOString()
          };
        }
        return it;
      });

      // Update state & cache immediately
      const nextOrders = [newOrder, ...orders];
      setOrders(nextOrders);
      storage.saveOrdersLocal(nextOrders);

      setItems(updatedItems);
      storage.saveItemsLocal(updatedItems);

      // Async write to Google Sheets
      storage.appendOrderToSheets(newOrder).catch(console.error);
      storage.syncItemsToSheets(updatedItems).catch(console.error);

      showToast('success', `✓ บันทึกคำสั่งซื้อ #${orderNumber} สำเร็จ`);
      setCurrentTab('history');
    } catch (err: any) {
      console.error(err);
      showToast('error', '⚠ ไม่สามารถบันทึกคำสั่งซื้อได้');
      throw err;
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // 2. Market Operations
  const handleSaveMarket = async (marketData: Partial<Market>) => {
    const isEdit = !!marketData.id;
    let nextMarkets: Market[];

    if (isEdit) {
      nextMarkets = markets.map(m => m.id === marketData.id ? { ...m, ...marketData } as Market : m);
    } else {
      const newMarket: Market = {
        id: `mkt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: marketData.name!.trim(),
        description: marketData.description?.trim() || '',
        createdAt: new Date().toISOString()
      };
      nextMarkets = [...markets, newMarket];
    }

    setMarkets(nextMarkets);
    storage.saveMarketsLocal(nextMarkets);
    showToast('success', isEdit ? '✓ แก้ไขตลาดสำเร็จ' : '✓ เพิ่มตลาดสำเร็จ');

    await storage.syncMarketsToSheets(nextMarkets).catch(console.error);
  };

  const handleDeleteMarket = async (marketId: string) => {
    const nextMarkets = markets.filter(m => m.id !== marketId);
    const nextCMS = categoryMarkets.filter(cm => cm.marketId !== marketId);

    setMarkets(nextMarkets);
    storage.saveMarketsLocal(nextMarkets);

    setCategoryMarkets(nextCMS);
    storage.saveCategoryMarketsLocal(nextCMS);

    showToast('success', '✓ ลบตลาดสำเร็จ');

    await storage.syncMarketsToSheets(nextMarkets).catch(console.error);
    await storage.syncCategoryMarketsToSheets(nextCMS).catch(console.error);
  };

  // 3. Category Operations
  const handleSaveCategory = async (categoryData: Partial<Category>, marketIds: string[]) => {
    const isEdit = !!categoryData.id;
    const catId = categoryData.id || `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let nextCategories: Category[];

    if (isEdit) {
      nextCategories = categories.map(c => c.id === catId ? { ...c, ...categoryData } as Category : c);
    } else {
      const newCat: Category = {
        id: catId,
        name: categoryData.name!.trim(),
        createdAt: new Date().toISOString()
      };
      nextCategories = [...categories, newCat];
    }

    // Update CategoryMarket links
    const filteredCMS = categoryMarkets.filter(cm => cm.categoryId !== catId);
    const newCMS: CategoryMarket[] = marketIds.map(mId => ({
      id: `cm_${catId}_${mId}`,
      categoryId: catId,
      marketId: mId
    }));
    const nextCMS = [...filteredCMS, ...newCMS];

    setCategories(nextCategories);
    storage.saveCategoriesLocal(nextCategories);

    setCategoryMarkets(nextCMS);
    storage.saveCategoryMarketsLocal(nextCMS);

    showToast('success', isEdit ? '✓ แก้ไขหมวดหมู่สำเร็จ' : '✓ เพิ่มหมวดหมู่สำเร็จ');

    await storage.syncCategoriesToSheets(nextCategories).catch(console.error);
    await storage.syncCategoryMarketsToSheets(nextCMS).catch(console.error);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const nextCats = categories.filter(c => c.id !== categoryId);
    const nextCMS = categoryMarkets.filter(cm => cm.categoryId !== categoryId);

    setCategories(nextCats);
    storage.saveCategoriesLocal(nextCats);

    setCategoryMarkets(nextCMS);
    storage.saveCategoryMarketsLocal(nextCMS);

    showToast('success', '✓ ลบหมวดหมู่สำเร็จ');

    await storage.syncCategoriesToSheets(nextCats).catch(console.error);
    await storage.syncCategoryMarketsToSheets(nextCMS).catch(console.error);
  };

  // 4. Item Operations
  const handleSaveItem = async (itemData: Partial<Item>) => {
    const isEdit = !!itemData.id;
    let nextItems: Item[];

    if (isEdit) {
      nextItems = items.map(i => i.id === itemData.id ? { ...i, ...itemData, updatedAt: new Date().toISOString() } as Item : i);
    } else {
      const newItem: Item = {
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: itemData.name!.trim(),
        categoryId: itemData.categoryId!,
        stock: Number(itemData.stock) || 0,
        unit: itemData.unit || 'กิโลกรัม',
        updatedAt: new Date().toISOString()
      };
      nextItems = [...items, newItem];
    }

    setItems(nextItems);
    storage.saveItemsLocal(nextItems);
    showToast('success', isEdit ? '✓ บันทึกการแก้ไขสินค้าสำเร็จ' : '✓ เพิ่มสินค้าใหม่สำเร็จ');

    await storage.syncItemsToSheets(nextItems).catch(console.error);
  };

  const handleDeleteItem = async (itemId: string) => {
    const nextItems = items.filter(i => i.id !== itemId);
    setItems(nextItems);
    storage.saveItemsLocal(nextItems);
    showToast('success', '✓ ลบสินค้าสำเร็จ');

    await storage.syncItemsToSheets(nextItems).catch(console.error);
  };

  // 5. User Operations with Anti-Duplicate checks
  const handleSaveUser = async (userData: Partial<User>) => {
    const isEdit = !!userData.id;
    const cleanPin = String(userData.pin || '').padStart(4, '0');

    // Strict validation
    const pinConflict = users.some(u => u.id !== userData.id && u.pin === cleanPin);
    if (pinConflict) {
      showToast('error', `⚠ ไม่สามารถบันทึกได้ — PIN ${cleanPin} นี้ถูกใช้งานแล้ว`);
      throw new Error('PIN duplicated');
    }

    let nextUsers: User[];
    if (isEdit) {
      nextUsers = users.map(u => u.id === userData.id ? { ...u, ...userData, pin: cleanPin } as User : u);
    } else {
      const newUser: User = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: userData.name!.trim(),
        pin: cleanPin,
        role: userData.role ?? 0,
        status: userData.status || 'ACTIVE',
        assignedMarketIds: userData.assignedMarketIds || [],
        createdAt: new Date().toISOString()
      };
      nextUsers = [...users, newUser];
    }

    setUsers(nextUsers);
    storage.saveUsersLocal(nextUsers);
    showToast('success', isEdit ? '✓ แก้ไขผู้ใช้งานสำเร็จ' : '✓ เพิ่มผู้ใช้งานสำเร็จ');

    await storage.syncUsersToSheets(nextUsers).catch(console.error);
  };

  const handleDeleteUser = async (userId: string) => {
    const target = users.find(u => u.id === userId);
    if (target?.pin === '0000' && target?.role === 1) {
      showToast('error', '⚠ ไม่สามารถลบ Admin เริ่มต้น (PIN: 0000) ได้');
      return;
    }

    const nextUsers = users.filter(u => u.id !== userId);
    setUsers(nextUsers);
    storage.saveUsersLocal(nextUsers);
    showToast('success', '✓ ลบผู้ใช้งานสำเร็จ');

    await storage.syncUsersToSheets(nextUsers).catch(console.error);
  };

  // 6. Excel Data Import Handler
  const handleImportExcelData = async (newCats: Category[], newItemsList: Item[]) => {
    const nextCategories = [...categories, ...newCats];
    const nextItems = [...items, ...newItemsList];

    // If new categories were created, link them to all existing markets by default so they appear
    const newCMS: CategoryMarket[] = [];
    newCats.forEach(c => {
      markets.forEach(m => {
        newCMS.push({
          id: `cm_${c.id}_${m.id}`,
          categoryId: c.id,
          marketId: m.id
        });
      });
    });
    const nextCMS = [...categoryMarkets, ...newCMS];

    setCategories(nextCategories);
    storage.saveCategoriesLocal(nextCategories);

    setCategoryMarkets(nextCMS);
    storage.saveCategoryMarketsLocal(nextCMS);

    setItems(nextItems);
    storage.saveItemsLocal(nextItems);

    // Sync to Sheets
    if (newCats.length > 0) {
      storage.syncCategoriesToSheets(nextCategories).catch(console.error);
      storage.syncCategoryMarketsToSheets(nextCMS).catch(console.error);
    }
    storage.syncItemsToSheets(nextItems).catch(console.error);
  };

  // 7. Manual Refresh from Sheets
  const handleRefreshFromSheets = async () => {
    setIsSyncingSheets(true);
    try {
      const ok = await storage.syncAllFromSheets();
      if (ok) {
        setMarkets(storage.getMarketsLocal());
        setCategories(storage.getCategoriesLocal());
        setCategoryMarkets(storage.getCategoryMarketsLocal());
        setItems(storage.getItemsLocal());
        setUsers(storage.getUsersLocal());
        setOrders(storage.getOrdersLocal());
        showToast('success', '✓ ซิงค์ข้อมูลล่าสุดจาก Google Sheets สำเร็จ');
      } else {
        showToast('error', '⚠ ไม่สามารถเชื่อมต่อกับ Google Sheets ได้');
      }
    } catch {
      showToast('error', '⚠ การซิงค์ล้มเหลว');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleCreateOrConnectSheets = async () => {
    setIsSyncingSheets(true);
    try {
      const token = storage.getToken();
      if (!token) {
        showToast('error', 'OAuth token ไม่พร้อมใช้งาน');
        return;
      }
      const client = new GoogleSheetsClient(token);
      const newSheet = await client.createHPPSpreadsheet('HPP Order & Inventory Database');
      storage.setSpreadsheetId(newSheet.id, newSheet.url, newSheet.title);
      setSpreadsheetConfig(storage.getSpreadsheetConfig());

      // Sync all current data to the newly created sheet
      await storage.syncMarketsToSheets(markets);
      await storage.syncCategoriesToSheets(categories);
      await storage.syncCategoryMarketsToSheets(categoryMarkets);
      await storage.syncItemsToSheets(items);
      await storage.syncUsersToSheets(users);

      showToast('success', '✓ สร้างสเปรดชีตใหม่และเชื่อมต่อสำเร็จ');
    } catch (err: any) {
      showToast('error', `⚠ ${err.message || 'ไม่สามารถสร้างสเปรดชีตได้'}`);
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // If user is not authenticated, render instant Login screen
  if (!currentUser) {
    return (
      <>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        <LoginScreen
          users={users}
          onLoginSuccess={handleLoginSuccess}
          onShowToast={showToast}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Main Top Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 font-bold">
              HPP
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight leading-tight">
                ระบบจัดการสินค้า & สั่งซื้อ
              </h1>
              <p className="text-[10px] text-slate-400">
                Google Sheets Database
              </p>
            </div>
          </div>

          {/* User profile & Logout */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-slate-200">
                {currentUser.name}
              </div>
              <div className="text-[10px] text-emerald-400 font-medium">
                {currentUser.role === 1 ? 'ผู้ดูแลระบบ (Admin)' : 'ผู้ใช้งานทั่วไป'}
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-slate-300 hover:text-white transition-all text-xs inline-flex items-center gap-1.5"
              title="ออกจากระบบ"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">ออก</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="border-t border-slate-800 bg-slate-900/90">
          <div className="max-w-5xl mx-auto px-4 flex items-center justify-around sm:justify-start gap-1 sm:gap-2 py-1.5">
            <button
              onClick={() => setCurrentTab('order')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 transition-all ${
                currentTab === 'order'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>สั่งซื้อสินค้า</span>
            </button>

            <button
              onClick={() => setCurrentTab('history')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 transition-all ${
                currentTab === 'history'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>ประวัติ ({currentUser.role === 1 ? orders.length : orders.filter(o => o.userId === currentUser.id).length})</span>
            </button>

            {currentUser.role === 1 && (
              <button
                onClick={() => setCurrentTab('admin')}
                className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 transition-all ${
                  currentTab === 'admin'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>จัดการข้อมูล (Admin)</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-3 sm:p-5">
        {currentTab === 'order' && (
          <OrderView
            currentUser={currentUser}
            markets={markets}
            categories={categories}
            categoryMarkets={categoryMarkets}
            items={items}
            isSubmittingOrder={isSubmittingOrder}
            onSubmitOrder={handleSubmitOrder}
            onShowToast={showToast}
          />
        )}

        {currentTab === 'history' && (
          <OrderHistoryView
            orders={orders}
            currentUser={currentUser}
          />
        )}

        {currentTab === 'admin' && currentUser.role === 1 && (
          <AdminManageView
            markets={markets}
            categories={categories}
            categoryMarkets={categoryMarkets}
            items={items}
            users={users}
            currentUser={currentUser}
            spreadsheetConfig={spreadsheetConfig}
            isSyncingSheets={isSyncingSheets}
            onRefreshFromSheets={handleRefreshFromSheets}
            onCreateOrConnectSheets={handleCreateOrConnectSheets}
            onSaveMarket={handleSaveMarket}
            onDeleteMarket={handleDeleteMarket}
            onSaveCategory={handleSaveCategory}
            onDeleteCategory={handleDeleteCategory}
            onSaveItem={handleSaveItem}
            onDeleteItem={handleDeleteItem}
            onSaveUser={handleSaveUser}
            onDeleteUser={handleDeleteUser}
            onImportExcelData={handleImportExcelData}
            onShowToast={showToast}
          />
        )}
      </main>
    </div>
  );
}
