import React, { useState, useMemo } from 'react';
import { Order, User } from '../types';
import { FileText, Search, Calendar, Store, User as UserIcon, Eye, Download, ChevronRight } from 'lucide-react';
import { OrderReceiptModal } from './OrderReceiptModal';

interface OrderHistoryViewProps {
  orders: Order[];
  currentUser: User;
}

export const OrderHistoryView: React.FC<OrderHistoryViewProps> = ({ orders, currentUser }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Role 1 (Admin) sees all orders; Role 0 sees only their own orders
  const visibleOrders = useMemo(() => {
    let list = currentUser.role === 1 ? orders : orders.filter(o => o.userId === currentUser.id);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(o =>
        o.id.toLowerCase().includes(q) ||
        o.marketName.toLowerCase().includes(q) ||
        o.userName.toLowerCase().includes(q) ||
        o.items.some(it => it.itemName.toLowerCase().includes(q))
      );
    }

    // Sort newest first
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, currentUser, searchQuery]);

  return (
    <div className="max-w-4xl mx-auto pb-16">
      {/* Header and Filter */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/80 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            ประวัติการสั่งซื้อ ({visibleOrders.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {currentUser.role === 1 ? 'แสดงประวัติคำสั่งซื้อทั้งหมดในระบบ' : 'แสดงเฉพาะคำสั่งซื้อของคุณ'}
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาเลขที่, ตลาด, ผู้สั่ง..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Orders List */}
      {visibleOrders.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 text-slate-400">
          <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-medium">ยังไม่มีประวัติการสั่งซื้อ</p>
          <p className="text-xs text-slate-400 mt-1">คำสั่งซื้อที่ส่งรายการแล้วจะปรากฏที่นี่</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleOrders.map(order => {
            const formattedDate = new Date(order.createdAt).toLocaleString('th-TH', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            const totalQty = order.items.reduce((sum, it) => sum + (it.quantity || 0), 0);

            return (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/80 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
              >
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                      #{order.id}
                    </span>
                    <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
                      {order.marketName}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formattedDate}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 mt-2">
                    <div className="flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span>{order.userName}</span>
                    </div>

                    <div className="font-medium text-slate-800">
                      รวม {order.items.length} รายการ ({totalQty} หน่วย)
                    </div>
                  </div>

                  {/* Quick items sample */}
                  <div className="mt-2 text-xs text-slate-500 truncate max-w-lg">
                    {order.items.map(it => `${it.itemName} (${it.quantity} ${it.unit})`).join(', ')}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedOrder(order);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 group-hover:bg-emerald-600 group-hover:text-white text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    ดูใบรายการ
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Modal Viewer & Exporter */}
      {selectedOrder && (
        <OrderReceiptModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
};
