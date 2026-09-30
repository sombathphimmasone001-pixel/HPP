import React, { useState, useMemo } from 'react';
import { Market, Category, CategoryMarket, Item, User, OrderItem } from '../types';
import { 
  ShoppingCart, 
  Store, 
  Search, 
  Trash2, 
  Send, 
  Plus, 
  Minus, 
  Filter, 
  X, 
  Check, 
  Layers, 
  Tag, 
  CheckCircle2,
  ListFilter
} from 'lucide-react';
import { Dialog } from './Dialog';

interface OrderViewProps {
  currentUser: User;
  markets: Market[];
  categories: Category[];
  categoryMarkets: CategoryMarket[];
  items: Item[];
  isSubmittingOrder: boolean;
  onSubmitOrder: (order: { marketId: string; marketName: string; items: OrderItem[]; note?: string }) => Promise<void>;
  onShowToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const OrderView: React.FC<OrderViewProps> = ({
  currentUser,
  markets,
  categories,
  categoryMarkets,
  items,
  isSubmittingOrder,
  onSubmitOrder,
  onShowToast
}) => {
  // Filter markets accessible to this user
  const accessibleMarkets = useMemo(() => {
    if (currentUser.role === 1) return markets; // Admin can order in all markets
    if (!currentUser.assignedMarketIds || currentUser.assignedMarketIds.length === 0) {
      return markets; // Default to all if not restricted
    }
    return markets.filter(m => currentUser.assignedMarketIds?.includes(m.id));
  }, [markets, currentUser]);

  // Selected market
  const [selectedMarketId, setSelectedMarketId] = useState<string>(() => {
    return accessibleMarkets.length > 0 ? accessibleMarkets[0].id : '';
  });

  // Selected category in chosen market
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');

  // Search filter query
  const [searchQuery, setSearchQuery] = useState('');

  // Stock filter toggle (All vs In Stock only)
  const [stockFilter, setStockFilter] = useState<'ALL' | 'IN_STOCK' | 'SELECTED'>('ALL');

  // Cart state: itemId -> number (SINGLE EXACT QUANTITY, strictly a single integer/number)
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState(false);

  // Available categories for selected market
  const currentMarketCategories = useMemo(() => {
    if (!selectedMarketId) return [];
    const validCategoryIds = categoryMarkets
      .filter(cm => cm.marketId === selectedMarketId)
      .map(cm => cm.categoryId);

    return categories.filter(c => validCategoryIds.includes(c.id));
  }, [selectedMarketId, categoryMarkets, categories]);

  // Available items for the current market & selected category with robust search & category filter
  const filteredItems = useMemo(() => {
    if (!selectedMarketId) return [];
    const validCatIds = currentMarketCategories.map(c => c.id);

    return items.filter(item => {
      // Must belong to category connected to this market
      if (!validCatIds.includes(item.categoryId)) return false;

      // Category tab filter
      if (selectedCategoryId !== 'ALL' && item.categoryId !== selectedCategoryId) {
        return false;
      }

      // Stock status filter
      if (stockFilter === 'IN_STOCK' && item.stock <= 0) {
        return false;
      }
      if (stockFilter === 'SELECTED' && (!quantities[item.id] || quantities[item.id] <= 0)) {
        return false;
      }

      // Search text query (matches item name, category name, or unit)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const cat = categories.find(c => c.id === item.categoryId);
        const catName = (cat?.name || '').toLowerCase();
        const itemName = item.name.toLowerCase();
        const unitName = item.unit.toLowerCase();

        return itemName.includes(q) || catName.includes(q) || unitName.includes(q);
      }

      return true;
    });
  }, [items, currentMarketCategories, selectedCategoryId, searchQuery, stockFilter, quantities, selectedMarketId, categories]);

  // Item counts in order
  const orderedItemsList: OrderItem[] = useMemo(() => {
    const list: OrderItem[] = [];
    Object.entries(quantities).forEach(([itemId, qty]) => {
      if (qty > 0) {
        const it = items.find(i => i.id === itemId);
        if (it) {
          const cat = categories.find(c => c.id === it.categoryId);
          list.push({
            itemId: it.id,
            itemName: it.name,
            categoryName: cat?.name || 'ทั่วไป',
            stockAtOrder: it.stock,
            quantity: Math.floor(qty), // Strictly single integer number
            unit: it.unit
          });
        }
      }
    });
    return list;
  }, [quantities, items, categories]);

  const totalItemCount = orderedItemsList.length;
  const totalUnitsCount = orderedItemsList.reduce((acc, it) => acc + it.quantity, 0);

  // Handle quantity modification
  const handleQuantityChange = (itemId: string, val: string | number) => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num <= 0) {
      setQuantities(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } else {
      setQuantities(prev => ({
        ...prev,
        [itemId]: Math.max(1, Math.floor(num))
      }));
    }
  };

  const handleIncrement = (itemId: string) => {
    setQuantities(prev => ({
      ...prev,
      [itemId]: (prev[itemId] || 0) + 1
    }));
  };

  const handleDecrement = (itemId: string) => {
    setQuantities(prev => {
      const current = prev[itemId] || 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return {
        ...prev,
        [itemId]: current - 1
      };
    });
  };

  const handleClearCart = () => {
    setQuantities({});
    setNote('');
  };

  const handleOpenConfirm = () => {
    if (!selectedMarketId) {
      onShowToast('error', 'กรุณาเลือกตลาดก่อนสั่งซื้อ');
      return;
    }
    if (orderedItemsList.length === 0) {
      onShowToast('error', 'กรุณาระบุจำนวนสินค้าอย่างน้อย 1 รายการ');
      return;
    }
    setConfirmDialog(true);
  };

  const handleConfirmOrder = async () => {
    const market = markets.find(m => m.id === selectedMarketId);
    if (!market) return;

    try {
      await onSubmitOrder({
        marketId: market.id,
        marketName: market.name,
        items: orderedItemsList,
        note: note.trim() || undefined
      });
      // Clear cart upon success
      setQuantities({});
      setNote('');
      setConfirmDialog(false);
    } catch {
      // error handled by parent with Toast
    }
  };

  const selectedMarket = markets.find(m => m.id === selectedMarketId);

  return (
    <div className="max-w-4xl mx-auto pb-28">
      {/* 1. Step: Market Selection */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/80 mb-4">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
          <Store className="w-4 h-4 text-emerald-600" />
          เลือกตลาด
        </label>

        {accessibleMarkets.length === 0 ? (
          <div className="text-center py-6 text-sm text-slate-500">
            ยังไม่มีตลาดในระบบ (กรุณาให้ผู้ดูแลสร้างตลาดในเมนูจัดการ)
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {accessibleMarkets.map(m => {
              const isSelected = m.id === selectedMarketId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedMarketId(m.id);
                    setSelectedCategoryId('ALL');
                    setSearchQuery('');
                  }}
                  className={`p-3 rounded-xl border text-left transition-all relative ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/80 text-emerald-950 font-semibold ring-2 ring-emerald-500/20 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <div className="text-sm truncate">{m.name}</div>
                  {m.description && (
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">{m.description}</div>
                  )}
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-600" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedMarketId && (
        <>
          {/* 2. Step: Search & Category Filter Section (Sticky on scroll for fast access) */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/80 mb-4">
            
            {/* Search Bar & Quick Filters Row */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
              {/* Primary Search Bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อสินค้า, หมวดหมู่, หรือหน่วย เช่น คะน้า, ผัก, กิโล..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* View / Stock Status Filter Badges */}
              <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => setStockFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    stockFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  ทั้งหมด
                </button>

                <button
                  type="button"
                  onClick={() => setStockFilter('IN_STOCK')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    stockFilter === 'IN_STOCK'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  มีสต็อก (&gt;0)
                </button>

                <button
                  type="button"
                  onClick={() => setStockFilter('SELECTED')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all inline-flex items-center gap-1 ${
                    stockFilter === 'SELECTED'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>เลือกแล้ว</span>
                  {totalItemCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px] font-bold">
                      {totalItemCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Category Filter Chips / Selectors */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-emerald-600" />
                  หมวดหมู่ ({currentMarketCategories.length})
                </label>
                {selectedCategoryId !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryId('ALL')}
                    className="text-xs text-slate-400 hover:text-slate-600 underline font-medium"
                  >
                    ดูทุกหมวดหมู่
                  </button>
                )}
              </div>

              {currentMarketCategories.length === 0 ? (
                <div className="text-center py-4 text-xs text-amber-700 bg-amber-50 rounded-xl border border-amber-200/60 p-3">
                  ตลาดนี้ยังไม่ได้ผูกหมวดหมู่สินค้า (กรุณาไปที่เมนู <b>จัดการข้อมูล</b> → <b>หมวดหมู่</b> เพื่อผูกหมวดหมู่กับตลาดนี้)
                </div>
              ) : (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  {/* ALL Categories Pill */}
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryId('ALL')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      selectedCategoryId === 'ALL'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>ทั้งหมด</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      selectedCategoryId === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {items.filter(i => currentMarketCategories.some(c => c.id === i.categoryId)).length}
                    </span>
                  </button>

                  {/* Individual Category Pills */}
                  {currentMarketCategories.map(cat => {
                    const isSelected = selectedCategoryId === cat.id;
                    const catItemsCount = items.filter(i => i.categoryId === cat.id).length;

                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <span>{cat.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {catItemsCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 3. Step: Items List with Stock & Exact Single Quantity Order */}
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden mb-6">
            <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                  <span>รายการสินค้า ({filteredItems.length})</span>
                  {(searchQuery || selectedCategoryId !== 'ALL' || stockFilter !== 'ALL') && (
                    <span className="text-[11px] font-normal text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                      กรองข้อมูลอยู่
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  ใส่จำนวนสั่งซื้อที่ต้องการ (ระบบจะบันทึกเป็นเลขเดี่ยว)
                </p>
              </div>

              {orderedItemsList.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCart}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  ล้างรายการที่เลือก
                </button>
              )}
            </div>

            {filteredItems.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm">
                <Search className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="font-medium text-slate-600">ไม่พบรายการสินค้าที่ตรงกับเงื่อนไข</p>
                {(searchQuery || selectedCategoryId !== 'ALL' || stockFilter !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategoryId('ALL');
                      setStockFilter('ALL');
                    }}
                    className="mt-3 text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
                  >
                    รีเซ็ตตัวกรองทั้งหมด
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredItems.map(item => {
                  const currentQty = quantities[item.id] || 0;
                  const cat = categories.find(c => c.id === item.categoryId);

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        currentQty > 0 ? 'bg-emerald-50/40' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      {/* Item Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 text-sm">
                            {item.name}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                            {cat?.name || 'ทั่วไป'}
                          </span>
                        </div>

                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                          <div>
                            <span>คงเหลือ (Stock): </span>
                            <span className={`font-semibold font-mono ${
                              item.stock <= 0 ? 'text-rose-500' : 'text-slate-800'
                            }`}>
                              {item.stock}
                            </span>
                            <span className="ml-1 text-slate-400">{item.unit}</span>
                          </div>
                        </div>
                      </div>

                      {/* Quantity Controller - SINGLE NUMBER ONLY */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                          <button
                            type="button"
                            onClick={() => handleDecrement(item.id)}
                            disabled={currentQty === 0}
                            className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent active:bg-slate-200 transition-colors"
                          >
                            <Minus className="w-4 h-4" />
                          </button>

                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={currentQty === 0 ? '' : currentQty}
                            placeholder="0"
                            onChange={e => handleQuantityChange(item.id, e.target.value)}
                            className="w-16 h-9 text-center font-bold text-slate-900 focus:outline-none focus:bg-emerald-50/50 text-sm font-mono border-x border-slate-200"
                          />

                          <button
                            type="button"
                            onClick={() => handleIncrement(item.id)}
                            className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        <span className="text-xs text-slate-500 w-12 text-left truncate font-medium">
                          {item.unit}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Optional Note */}
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 mb-6">
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              หมายเหตุคำสั่งซื้อ (ถ้ามี)
            </label>
            <input
              type="text"
              placeholder="เช่น ต้องการส่งด่วน, ฝากแช่เย็น..."
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
            />
          </div>
        </>
      )}

      {/* Floating Bottom Bar for Mobile & Desktop */}
      {orderedItemsList.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 sm:p-4 shadow-xl">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500 font-medium">
                รายการที่เลือก: <span className="font-bold text-slate-900">{totalItemCount} รายการ</span> ({totalUnitsCount} หน่วย)
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-0.5">
                ตลาด: {selectedMarket?.name}
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenConfirm}
              disabled={isSubmittingOrder}
              className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold text-sm shadow-md shadow-emerald-500/20 inline-flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isSubmittingOrder ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  กำลังส่งรายการ...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  ส่งรายการสั่งซื้อ
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog
        isOpen={confirmDialog}
        title="ยืนยันการสั่งซื้อสินค้า"
        confirmLabel="ยืนยันส่งคำสั่งซื้อ"
        confirmVariant="success"
        isLoading={isSubmittingOrder}
        onConfirm={handleConfirmOrder}
        onCancel={() => setConfirmDialog(false)}
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            คุณกำลังจะส่งรายการสั่งซื้อไปยังตลาด <b>{selectedMarket?.name}</b> รวม <b>{totalItemCount}</b> รายการ:
          </p>

          <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
            {orderedItemsList.map(it => (
              <div key={it.itemId} className="p-2.5 flex items-center justify-between bg-slate-50/50">
                <span className="font-medium text-slate-800">{it.itemName}</span>
                <span className="font-mono font-bold text-emerald-700">
                  {it.quantity} {it.unit}
                </span>
              </div>
            ))}
          </div>

          {note && (
            <div className="p-2 bg-slate-100 rounded-lg text-xs text-slate-600">
              <span className="font-semibold">หมายเหตุ: </span> {note}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
};
