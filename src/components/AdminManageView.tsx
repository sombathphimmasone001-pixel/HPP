import React, { useState } from 'react';
import { Market, Category, CategoryMarket, Item, User } from '../types';
import { 
  Store, 
  FolderTree, 
  Package, 
  Users as UsersIcon, 
  Plus, 
  Edit3, 
  Trash2, 
  Search, 
  Check, 
  Upload, 
  ShieldAlert,
  ArrowRight,
  Database,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { Dialog } from './Dialog';
import { ExcelImportModal } from './ExcelImportModal';

interface AdminManageViewProps {
  markets: Market[];
  categories: Category[];
  categoryMarkets: CategoryMarket[];
  items: Item[];
  users: User[];
  currentUser: User;
  spreadsheetConfig: any;
  isSyncingSheets: boolean;
  onRefreshFromSheets: () => Promise<void>;
  onCreateOrConnectSheets: () => Promise<void>;
  // Entity Handlers
  onSaveMarket: (market: Partial<Market>) => Promise<void>;
  onDeleteMarket: (marketId: string) => Promise<void>;
  onSaveCategory: (category: Partial<Category>, marketIds: string[]) => Promise<void>;
  onDeleteCategory: (categoryId: string) => Promise<void>;
  onSaveItem: (item: Partial<Item>) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onSaveUser: (user: Partial<User>) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onImportExcelData: (newCats: Category[], newItems: Item[]) => Promise<void>;
  onShowToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const AdminManageView: React.FC<AdminManageViewProps> = ({
  markets,
  categories,
  categoryMarkets,
  items,
  users,
  currentUser,
  spreadsheetConfig,
  isSyncingSheets,
  onRefreshFromSheets,
  onCreateOrConnectSheets,
  onSaveMarket,
  onDeleteMarket,
  onSaveCategory,
  onDeleteCategory,
  onSaveItem,
  onDeleteItem,
  onSaveUser,
  onDeleteUser,
  onImportExcelData,
  onShowToast
}) => {
  const [activeTab, setActiveTab] = useState<'markets' | 'categories' | 'items' | 'users' | 'sheets'>('markets');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Dialogs
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    title: string;
    targetName: string;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    targetName: '',
    action: async () => {}
  });

  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Market Edit Form
  const [marketModal, setMarketModal] = useState<{ isOpen: boolean; data: Partial<Market> | null }>({
    isOpen: false,
    data: null
  });

  // Category Edit Form
  const [categoryModal, setCategoryModal] = useState<{
    isOpen: boolean;
    data: Partial<Category> | null;
    selectedMarketIds: string[];
  }>({
    isOpen: false,
    data: null,
    selectedMarketIds: []
  });

  // Item Edit Form
  const [itemModal, setItemModal] = useState<{
    isOpen: boolean;
    data: Partial<Item> | null;
    customUnit: string;
  }>({
    isOpen: false,
    data: null,
    customUnit: ''
  });

  // User Edit Form
  const [userModal, setUserModal] = useState<{
    isOpen: boolean;
    data: Partial<User> | null;
    selectedMarketIds: string[];
  }>({
    isOpen: false,
    data: null,
    selectedMarketIds: []
  });

  // Excel Modal
  const [isExcelOpen, setIsExcelOpen] = useState(false);

  // Common Unit options
  const STANDARD_UNITS = ['กิโลกรัม', 'ลูก', 'ชิ้น', 'ลิตร', 'แพ็ค', 'กล่อง', 'ถุง', 'มัด', 'อื่นๆ'];

  // --- SUBMIT HANDLERS WITH DEBOUNCE/LOCK GUARD ---

  const handleSaveMarketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marketModal.data?.name?.trim()) {
      onShowToast('error', 'กรุณาระบุชื่อตลาด');
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSaveMarket(marketModal.data);
      setMarketModal({ isOpen: false, data: null });
    } catch {
      // toast shown in parent
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryModal.data?.name?.trim()) {
      onShowToast('error', 'กรุณาระบุชื่อหมวดหมู่');
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSaveCategory(categoryModal.data, categoryModal.selectedMarketIds);
      setCategoryModal({ isOpen: false, data: null, selectedMarketIds: [] });
    } catch {
      // toast shown in parent
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemModal.data?.name?.trim()) {
      onShowToast('error', 'กรุณาระบุชื่อสินค้า');
      return;
    }
    if (!itemModal.data?.categoryId) {
      onShowToast('error', 'กรุณาเลือกหมวดหมู่');
      return;
    }
    if (isSaving) return;
    setIsSaving(true);

    const finalUnit = itemModal.data.unit === 'อื่นๆ' ? itemModal.customUnit.trim() || 'ชิ้น' : (itemModal.data.unit || 'ชิ้น');

    try {
      await onSaveItem({
        ...itemModal.data,
        unit: finalUnit
      });
      setItemModal({ isOpen: false, data: null, customUnit: '' });
    } catch {
      // toast shown in parent
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userModal.data?.name?.trim()) {
      onShowToast('error', 'กรุณาระบุชื่อผู้ใช้งาน');
      return;
    }
    const cleanPin = String(userModal.data?.pin || '').trim();
    if (cleanPin.length !== 4 || !/^\d{4}$/.test(cleanPin)) {
      onShowToast('error', 'PIN ต้องเป็นตัวเลข 4 หลัก (เช่น 0000, 1234)');
      return;
    }

    // SERVER-LEVEL/CLIENT-LEVEL VALIDATION: Duplicate check
    const currentId = userModal.data?.id;
    const isPinDuplicate = users.some(u => u.id !== currentId && u.pin === cleanPin);
    if (isPinDuplicate) {
      onShowToast('error', `⚠ ไม่สามารถบันทึกได้ — PIN ${cleanPin} นี้ถูกใช้งานแล้ว`);
      return;
    }

    if (isSaving) return; // Prevent 4-5 multi-clicks
    setIsSaving(true);

    try {
      await onSaveUser({
        ...userModal.data,
        pin: cleanPin,
        assignedMarketIds: userModal.selectedMarketIds
      });
      setUserModal({ isOpen: false, data: null, selectedMarketIds: [] });
    } catch {
      // error handled
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-24">
      {/* Sub-navigation tabs */}
      <div className="bg-white rounded-2xl p-2 shadow-xs border border-slate-200/80 mb-6 flex flex-wrap gap-1">
        <button
          onClick={() => setActiveTab('markets')}
          className={`flex-1 min-w-[110px] py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'markets'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Store className="w-4 h-4 text-emerald-400" />
          <span>ตลาด ({markets.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('categories')}
          className={`flex-1 min-w-[110px] py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'categories'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FolderTree className="w-4 h-4 text-emerald-400" />
          <span>หมวดหมู่ ({categories.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('items')}
          className={`flex-1 min-w-[110px] py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'items'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Package className="w-4 h-4 text-emerald-400" />
          <span>สินค้า ({items.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 min-w-[110px] py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'users'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <UsersIcon className="w-4 h-4 text-emerald-400" />
          <span>ผู้ใช้งาน ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('sheets')}
          className={`flex-1 min-w-[110px] py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'sheets'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-emerald-700 bg-emerald-50/60 hover:bg-emerald-100/60'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Google Sheets</span>
        </button>
      </div>

      {/* ======================= TAB 1: MARKETS ======================= */}
      {activeTab === 'markets' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">จัดการตลาด</h2>
              <p className="text-xs text-slate-500">
                เพิ่ม/แก้ไข/ลบตลาด สามารถกำหนดได้ว่าหมวดหมู่ใดแสดงในตลาดใด (ไม่จำกัดจำนวน)
              </p>
            </div>

            <button
              onClick={() => setMarketModal({ isOpen: true, data: { name: '', description: '' } })}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs inline-flex items-center gap-2 shadow-xs transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              เพิ่มตลาดใหม่
            </button>
          </div>

          {markets.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-200/80 text-slate-400">
              <Store className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium">ยังไม่มีข้อมูลตลาดในระบบ</p>
              <p className="text-xs text-slate-400 mt-1">เริ่มต้นระบบไม่มีข้อมูลตัวอย่าง Admin เป็นผู้สร้างข้อมูลเอง</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {markets.map(market => {
                const linkedCatsCount = categoryMarkets.filter(cm => cm.marketId === market.id).length;
                return (
                  <div key={market.id} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm text-slate-900">{market.name}</h3>
                        <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">
                          {linkedCatsCount} หมวดหมู่
                        </span>
                      </div>
                      {market.description && (
                        <p className="text-xs text-slate-500 mt-1">{market.description}</p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                      <button
                        onClick={() => setMarketModal({ isOpen: true, data: { ...market } })}
                        className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-xs inline-flex items-center gap-1 font-medium"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        แก้ไข
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({
                          isOpen: true,
                          title: 'ลบตลาด?',
                          targetName: market.name,
                          action: () => onDeleteMarket(market.id)
                        })}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors text-xs inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        ลบ
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 2: CATEGORIES ======================= */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">จัดการหมวดหมู่สินค้า</h2>
              <p className="text-xs text-slate-500">
                1 หมวดหมู่สามารถเลือกให้แสดงได้ในหลายตลาด (เช่น "ผัก" อยู่ได้ทั้งตลาดเช้าและตลาดค่ำ)
              </p>
            </div>

            <button
              onClick={() => {
                setCategoryModal({
                  isOpen: true,
                  data: { name: '' },
                  selectedMarketIds: markets.map(m => m.id) // Default checked for convenience
                });
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs inline-flex items-center gap-2 shadow-xs transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              เพิ่มหมวดหมู่ใหม่
            </button>
          </div>

          {categories.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-200/80 text-slate-400">
              <FolderTree className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium">ยังไม่มีหมวดหมู่สินค้า</p>
              <p className="text-xs text-slate-400 mt-1">เพิ่มหมวดหมู่เอง หรือนำเข้าผ่าน Excel ได้อัตโนมัติ</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categories.map(category => {
                const linkedMarkets = categoryMarkets
                  .filter(cm => cm.categoryId === category.id)
                  .map(cm => markets.find(m => m.id === cm.marketId)?.name)
                  .filter(Boolean);

                const itemsInCat = items.filter(i => i.categoryId === category.id).length;

                return (
                  <div key={category.id} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm text-slate-900">{category.name}</h3>
                        <span className="text-[11px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-md">
                          {itemsInCat} สินค้า
                        </span>
                      </div>

                      <div className="mt-2 text-xs text-slate-500">
                        <span className="text-[11px] font-medium text-slate-400 block mb-1">แสดงในตลาด:</span>
                        {linkedMarkets.length === 0 ? (
                          <span className="text-rose-500 italic text-[11px]">ยังไม่ได้ผูกกับตลาดใด</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {linkedMarkets.map((mName, idx) => (
                              <span key={idx} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px]">
                                {mName}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          const currentMarketIds = categoryMarkets
                            .filter(cm => cm.categoryId === category.id)
                            .map(cm => cm.marketId);
                          setCategoryModal({
                            isOpen: true,
                            data: { ...category },
                            selectedMarketIds: currentMarketIds
                          });
                        }}
                        className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-xs inline-flex items-center gap-1 font-medium"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        แก้ไข & ผูกตลาด
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({
                          isOpen: true,
                          title: 'ลบหมวดหมู่?',
                          targetName: category.name,
                          action: () => onDeleteCategory(category.id)
                        })}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors text-xs inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        ลบ
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 3: ITEMS ======================= */}
      {activeTab === 'items' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">จัดการรายการสินค้า</h2>
              <p className="text-xs text-slate-500">
                เพิ่ม/แก้ไข/ลบ/เปลี่ยน Stock/หน่วย/หมวดหมู่สินค้า หรือนำเข้าด้วย Excel
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsExcelOpen(true)}
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs inline-flex items-center gap-2 shadow-xs transition-colors shrink-0"
              >
                <Upload className="w-4 h-4 text-emerald-600" />
                นำเข้า Excel
              </button>

              <button
                onClick={() => {
                  setItemModal({
                    isOpen: true,
                    data: {
                      name: '',
                      categoryId: categories.length > 0 ? categories[0].id : '',
                      stock: 0,
                      unit: 'กิโลกรัม'
                    },
                    customUnit: ''
                  });
                }}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs inline-flex items-center gap-2 shadow-xs transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
                เพิ่มสินค้าใหม่
              </button>
            </div>
          </div>

          {/* Quick search input */}
          {items.length > 0 && (
            <div className="relative max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ค้นหาสินค้าตามชื่อ, หมวดหมู่, หน่วย..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>
          )}

          {items.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-200/80 text-slate-400">
              <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium">ยังไม่มีสินค้าในระบบ</p>
              <p className="text-xs text-slate-400 mt-1">
                คลิกปุ่ม "เพิ่มสินค้าใหม่" หรือคลิก "นำเข้า Excel" เพื่อเริ่มต้น
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <th className="py-3 px-4">ชื่อสินค้า</th>
                      <th className="py-3 px-4">หมวดหมู่</th>
                      <th className="py-3 px-3 text-right">คงเหลือ (Stock)</th>
                      <th className="py-3 px-3">หน่วย</th>
                      <th className="py-3 px-4 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items
                      .filter(i => {
                        if (!searchQuery.trim()) return true;
                        const q = searchQuery.toLowerCase();
                        const cat = categories.find(c => c.id === i.categoryId);
                        return (
                          i.name.toLowerCase().includes(q) ||
                          (cat?.name.toLowerCase().includes(q)) ||
                          i.unit.toLowerCase().includes(q)
                        );
                      })
                      .map(item => {
                        const cat = categories.find(c => c.id === item.categoryId);
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-4 font-medium text-slate-900">
                              {item.name}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600">
                              <span className="bg-slate-100 px-2 py-0.5 rounded text-xs">
                                {cat?.name || 'ทั่วไป'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                              {item.stock}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {item.unit}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    const isStandard = STANDARD_UNITS.includes(item.unit);
                                    setItemModal({
                                      isOpen: true,
                                      data: { ...item, unit: isStandard ? item.unit : 'อื่นๆ' },
                                      customUnit: isStandard ? '' : item.unit
                                    });
                                  }}
                                  className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="แก้ไขสินค้า"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm({
                                    isOpen: true,
                                    title: 'ลบสินค้า?',
                                    targetName: item.name,
                                    action: () => onDeleteItem(item.id)
                                  })}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="ลบสินค้า"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 4: USERS ======================= */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">จัดการผู้ใช้งานและสิทธิ์</h2>
              <p className="text-xs text-slate-500">
                เพิ่ม/แก้ไข/ลบ PIN, บทบาท (Admin/ผู้ใช้ทั่วไป), สถานะ ACTIVE/INACTIVE และตลาดที่สั่งได้
              </p>
            </div>

            <button
              onClick={() => {
                setUserModal({
                  isOpen: true,
                  data: {
                    name: '',
                    pin: '',
                    role: 0,
                    status: 'ACTIVE'
                  },
                  selectedMarketIds: []
                });
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs inline-flex items-center gap-2 shadow-xs transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              เพิ่มผู้ใช้ใหม่
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {users.map(u => {
              const isAdmin = u.role === 1;
              const isDefaultAdmin = u.pin === '0000' && isAdmin;

              return (
                <div key={u.id} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-sm text-slate-900">
                        {u.name}
                        {u.id === currentUser.id && (
                          <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-normal">
                            คุณ
                          </span>
                        )}
                      </div>

                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                        isAdmin
                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {isAdmin ? 'Admin' : 'ผู้ใช้งาน'}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                      <div className="flex items-center justify-between">
                        <span>PIN เข้าสู่ระบบ:</span>
                        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded tracking-widest">
                          {u.pin}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span>สถานะ:</span>
                        <span className={`font-semibold ${u.status === 'ACTIVE' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          ● {u.status}
                        </span>
                      </div>

                      <div className="pt-1">
                        <span className="text-[11px] text-slate-400 block mb-0.5">ตลาดที่สั่งซื้อได้:</span>
                        {!u.assignedMarketIds || u.assignedMarketIds.length === 0 ? (
                          <span className="text-slate-600 text-xs">สั่งได้ทุกตลาด</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {u.assignedMarketIds.map(mId => {
                              const mName = markets.find(m => m.id === mId)?.name;
                              return mName ? (
                                <span key={mId} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">
                                  {mName}
                                </span>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setUserModal({
                          isOpen: true,
                          data: { ...u },
                          selectedMarketIds: u.assignedMarketIds || []
                        });
                      }}
                      className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-xs inline-flex items-center gap-1 font-medium"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      แก้ไข
                    </button>

                    {!isDefaultAdmin && (
                      <button
                        onClick={() => setDeleteConfirm({
                          isOpen: true,
                          title: 'ลบผู้ใช้งาน?',
                          targetName: u.name,
                          action: () => onDeleteUser(u.id)
                        })}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors text-xs inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        ลบ
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================= TAB 5: GOOGLE SHEETS ======================= */}
      {activeTab === 'sheets' && (
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200/80 space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-600" />
              การเชื่อมต่อ Google Sheets (ฐานข้อมูลหลัก)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Google Sheets เป็นฐานข้อมูลหลักจริงตามข้อกำหนดระบบ: ตาราง Markets, Categories, CategoryMarkets, Items, Users, Orders, OrderItems, Settings, History
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs text-slate-500 block">สเปรดชีตปัจจุบัน</span>
                <span className="font-semibold text-slate-800 text-sm">
                  {spreadsheetConfig?.spreadsheetTitle || 'HPP Database (Auto-created)'}
                </span>
                {spreadsheetConfig?.spreadsheetId && (
                  <span className="font-mono text-xs text-slate-400 block mt-0.5">
                    ID: {spreadsheetConfig.spreadsheetId}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {spreadsheetConfig?.spreadsheetUrl && (
                  <a
                    href={spreadsheetConfig.spreadsheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    เปิดดูใน Google Sheets
                  </a>
                )}

                <button
                  type="button"
                  onClick={onRefreshFromSheets}
                  disabled={isSyncingSheets}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                  {isSyncingSheets ? 'กำลังซิงค์...' : 'ดึงข้อมูลล่าสุดจาก Sheets'}
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200/80 text-xs text-slate-600 space-y-1">
              <p>✓ บันทึก PIN 4 หลักปลอดภัย (เช่น <code>'0000</code>) เพื่อป้องกัน Google Sheets แปลงเป็นตัวเลข 0</p>
              <p>✓ ทุกการเพิ่ม แก้ไข ลบ ตลาด หมวดหมู่ สินค้า ผู้ใช้ และคำสั่งซื้อจะถูกซิงค์ตรงไปยัง Sheets</p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 flex justify-between items-center">
            <span className="text-xs text-slate-400">
              สร้างหรือเชื่อมต่อสเปรดชีตเล่มใหม่บน Google Drive ของคุณ
            </span>
            <button
              type="button"
              onClick={onCreateOrConnectSheets}
              disabled={isSyncingSheets}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              สร้างสเปรดชีตใหม่อัตโนมัติ
            </button>
          </div>
        </div>
      )}

      {/* ======================= DIALOG: DELETE CONFIRMATION ======================= */}
      <Dialog
        isOpen={deleteConfirm.isOpen}
        title={deleteConfirm.title}
        confirmLabel={isDeleting ? 'กำลังลบ...' : 'ลบข้อมูล'}
        confirmVariant="danger"
        isLoading={isDeleting}
        onConfirm={async () => {
          setIsDeleting(true);
          try {
            await deleteConfirm.action();
            setDeleteConfirm(prev => ({ ...prev, isOpen: false }));
          } finally {
            setIsDeleting(false);
          }
        }}
        onCancel={() => setDeleteConfirm(prev => ({ ...prev, isOpen: false }))}
      >
        <div className="text-sm text-slate-600">
          คุณกำลังจะลบ <b>"{deleteConfirm.targetName}"</b>
          <p className="mt-2 text-xs text-rose-600">
            การลบข้อมูลนี้ไม่สามารถย้อนกลับได้ และจะถูกลบออกจาก Google Sheets
          </p>
        </div>
      </Dialog>

      {/* ======================= MODAL: MARKET EDIT ======================= */}
      <Dialog
        isOpen={marketModal.isOpen}
        title={marketModal.data?.id ? 'แก้ไขตลาด' : 'เพิ่มตลาดใหม่'}
        confirmLabel={isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
        confirmVariant="primary"
        isLoading={isSaving}
        onConfirm={() => {
          const fakeEvent = { preventDefault: () => {} } as any;
          handleSaveMarketSubmit(fakeEvent);
        }}
        onCancel={() => setMarketModal({ isOpen: false, data: null })}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              ชื่อตลาด <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="เช่น ตลาดเช้า, ตลาดค่ำ, สาขาหลัก"
              value={marketModal.data?.name || ''}
              onChange={e => setMarketModal(prev => ({
                ...prev,
                data: { ...prev.data, name: e.target.value }
              }))}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              รายละเอียดเพิ่มเติม (ถ้ามี)
            </label>
            <input
              type="text"
              placeholder="เช่น เปิด 04:00 - 10:00 น."
              value={marketModal.data?.description || ''}
              onChange={e => setMarketModal(prev => ({
                ...prev,
                data: { ...prev.data, description: e.target.value }
              }))}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>
        </div>
      </Dialog>

      {/* ======================= MODAL: CATEGORY EDIT ======================= */}
      <Dialog
        isOpen={categoryModal.isOpen}
        title={categoryModal.data?.id ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่'}
        confirmLabel={isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
        confirmVariant="primary"
        isLoading={isSaving}
        onConfirm={() => {
          const fakeEvent = { preventDefault: () => {} } as any;
          handleSaveCategorySubmit(fakeEvent);
        }}
        onCancel={() => setCategoryModal({ isOpen: false, data: null, selectedMarketIds: [] })}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              ชื่อหมวดหมู่ <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="เช่น ผักสด, เนื้อสัตว์, เครื่องปรุง, ผลไม้"
              value={categoryModal.data?.name || ''}
              onChange={e => setCategoryModal(prev => ({
                ...prev,
                data: { ...prev.data, name: e.target.value }
              }))}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-2">
              เลือกตลาดที่หมวดหมู่นี้จะแสดง (เลือกได้หลายตลาด)
            </label>

            {markets.length === 0 ? (
              <p className="text-xs text-amber-600 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                ยังไม่มีตลาดในระบบ กรุณาสร้างตลาดก่อนผูกหมวดหมู่
              </p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2.5">
                {markets.map(market => {
                  const isChecked = categoryModal.selectedMarketIds.includes(market.id);
                  return (
                    <label
                      key={market.id}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer text-xs select-none"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) {
                            setCategoryModal(prev => ({
                              ...prev,
                              selectedMarketIds: [...prev.selectedMarketIds, market.id]
                            }));
                          } else {
                            setCategoryModal(prev => ({
                              ...prev,
                              selectedMarketIds: prev.selectedMarketIds.filter(id => id !== market.id)
                            }));
                          }
                        }}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <span className="font-medium text-slate-800">{market.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Dialog>

      {/* ======================= MODAL: ITEM EDIT ======================= */}
      <Dialog
        isOpen={itemModal.isOpen}
        title={itemModal.data?.id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
        confirmLabel={isSaving ? 'กำลังบันทึก...' : 'บันทึกสินค้า'}
        confirmVariant="primary"
        isLoading={isSaving}
        onConfirm={() => {
          const fakeEvent = { preventDefault: () => {} } as any;
          handleSaveItemSubmit(fakeEvent);
        }}
        onCancel={() => setItemModal({ isOpen: false, data: null, customUnit: '' })}
      >
        <div className="space-y-3.5">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              ชื่อสินค้า <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="เช่น คะน้า, แตงกวา, หมูสันนอก"
              value={itemModal.data?.name || ''}
              onChange={e => setItemModal(prev => ({
                ...prev,
                data: { ...prev.data, name: e.target.value }
              }))}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              หมวดหมู่สินค้า <span className="text-rose-500">*</span>
            </label>
            <select
              value={itemModal.data?.categoryId || ''}
              onChange={e => setItemModal(prev => ({
                ...prev,
                data: { ...prev.data, categoryId: e.target.value }
              }))}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            >
              <option value="">-- เลือกหมวดหมู่ --</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Stock (คงเหลือ)
              </label>
              <input
                type="number"
                min="0"
                value={itemModal.data?.stock ?? 0}
                onChange={e => setItemModal(prev => ({
                  ...prev,
                  data: { ...prev.data, stock: Math.max(0, Number(e.target.value) || 0) }
                }))}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                หน่วย
              </label>
              <select
                value={itemModal.data?.unit || 'กิโลกรัม'}
                onChange={e => setItemModal(prev => ({
                  ...prev,
                  data: { ...prev.data, unit: e.target.value }
                }))}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              >
                {STANDARD_UNITS.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          {itemModal.data?.unit === 'อื่นๆ' && (
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                ระบุหน่วยเอง
              </label>
              <input
                type="text"
                placeholder="เช่น ถัง, กระสอบ, มัดใหญ่"
                value={itemModal.customUnit}
                onChange={e => setItemModal(prev => ({ ...prev, customUnit: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>
          )}
        </div>
      </Dialog>

      {/* ======================= MODAL: USER EDIT ======================= */}
      <Dialog
        isOpen={userModal.isOpen}
        title={userModal.data?.id ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}
        confirmLabel={isSaving ? 'กำลังบันทึก...' : 'บันทึกผู้ใช้'}
        confirmVariant="primary"
        isLoading={isSaving}
        onConfirm={() => {
          const fakeEvent = { preventDefault: () => {} } as any;
          handleSaveUserSubmit(fakeEvent);
        }}
        onCancel={() => setUserModal({ isOpen: false, data: null, selectedMarketIds: [] })}
      >
        <div className="space-y-3.5">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              ชื่อผู้ใช้งาน <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="เช่น สมชาย ใจดี"
              value={userModal.data?.name || ''}
              onChange={e => setUserModal(prev => ({
                ...prev,
                data: { ...prev.data, name: e.target.value }
              }))}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              รหัส PIN 4 หลัก (ห้ามซ้ำ) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              maxLength={4}
              placeholder="0000"
              value={userModal.data?.pin || ''}
              onChange={e => setUserModal(prev => ({
                ...prev,
                data: { ...prev.data, pin: e.target.value.replace(/\D/g, '') }
              }))}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white font-mono tracking-widest text-center text-lg"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              ระบบป้องกันการตั้ง PIN ซ้ำ และรักษาค่า 4 หลักเมื่อบันทึกใน Google Sheets
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                สิทธิ์ (Role)
              </label>
              <select
                value={userModal.data?.role ?? 0}
                onChange={e => setUserModal(prev => ({
                  ...prev,
                  data: { ...prev.data, role: Number(e.target.value) }
                }))}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              >
                <option value={0}>0 - ผู้ใช้งานทั่วไป</option>
                <option value={1}>1 - Admin (ผู้ดูแล)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                สถานะ (Status)
              </label>
              <select
                value={userModal.data?.status || 'ACTIVE'}
                onChange={e => setUserModal(prev => ({
                  ...prev,
                  data: { ...prev.data, status: e.target.value as any }
                }))}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              >
                <option value="ACTIVE">ACTIVE (ใช้งานได้)</option>
                <option value="INACTIVE">INACTIVE (ปิดใช้งาน)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-2">
              ตลาดที่อนุญาตให้สั่งซื้อ (ไม่ติ๊ก = สั่งได้ทุกตลาด)
            </label>
            <div className="space-y-1.5 max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2.5">
              {markets.map(m => {
                const isChecked = userModal.selectedMarketIds.includes(m.id);
                return (
                  <label key={m.id} className="flex items-center gap-2 p-1.5 text-xs rounded hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={e => {
                        if (e.target.checked) {
                          setUserModal(prev => ({ ...prev, selectedMarketIds: [...prev.selectedMarketIds, m.id] }));
                        } else {
                          setUserModal(prev => ({ ...prev, selectedMarketIds: prev.selectedMarketIds.filter(id => id !== m.id) }));
                        }
                      }}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span>{m.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </Dialog>

      {/* ======================= EXCEL IMPORT MODAL ======================= */}
      <ExcelImportModal
        isOpen={isExcelOpen}
        categories={categories}
        existingItems={items}
        onClose={() => setIsExcelOpen(false)}
        onImportComplete={onImportExcelData}
        onShowToast={onShowToast}
      />
    </div>
  );
};
