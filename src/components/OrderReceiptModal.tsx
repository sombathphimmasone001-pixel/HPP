import React, { useRef, useState } from 'react';
import { Order } from '../types';
import { Download, FileText, Image as ImageIcon, X, Check, Calendar, Store, User as UserIcon } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface OrderReceiptModalProps {
  order: Order | null;
  onClose: () => void;
}

export const OrderReceiptModal: React.FC<OrderReceiptModalProps> = ({ order, onClose }) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  if (!order) return null;

  // Group items by category for clean presentation
  const groupedItems = order.items.reduce((acc, item) => {
    const cat = item.categoryName || 'ทั่วไป';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, typeof order.items>);

  const totalQuantity = order.items.reduce((sum, it) => sum + (it.quantity || 0), 0);

  /**
   * Helper to prepare an unconstrained, fully expanded offscreen clone
   * for pixel-perfect dynamic dimension calculations without viewport clipping.
   */
  const createRenderableContainer = (): { container: HTMLElement; cleanup: () => void } => {
    if (!receiptRef.current) throw new Error('Receipt element not found');

    const original = receiptRef.current;
    const container = original.cloneNode(true) as HTMLElement;

    // Reset all constraints to ensure natural sizing
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '780px'; // optimal desktop/print width
    container.style.minWidth = '780px';
    container.style.maxWidth = 'none';
    container.style.height = 'auto';
    container.style.minHeight = 'auto';
    container.style.maxHeight = 'none';
    container.style.overflow = 'visible';
    container.style.boxShadow = 'none';
    container.style.transform = 'none';
    container.style.margin = '0';
    container.style.zIndex = '-999';

    document.body.appendChild(container);

    return {
      container,
      cleanup: () => {
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }
    };
  };

  /**
   * 1. PNG EXPORT (Dynamic Canvas / Auto-Calculation):
   * - Calculates natural dynamic width and height according to full content and all items.
   * - No fixed height or viewport clamping.
   * - High resolution scale (2x) for sharp printing and sharing.
   */
  const handleDownloadPng = async () => {
    if (!receiptRef.current) return;
    setIsExportingPng(true);
    setExportProgress('กำลังคำนวณขนาดภาพ...');

    let tempContainer: HTMLElement | null = null;
    let cleanupFn: (() => void) | null = null;

    try {
      const prepared = createRenderableContainer();
      tempContainer = prepared.container;
      cleanupFn = prepared.cleanup;

      // Allow DOM to compute natural layout geometry
      await new Promise(resolve => requestAnimationFrame(resolve));

      const dynamicWidth = Math.max(780, tempContainer.scrollWidth, tempContainer.offsetWidth);
      const dynamicHeight = Math.max(tempContainer.scrollHeight, tempContainer.offsetHeight) + 20;

      setExportProgress(`กำลังเรนเดอร์ภาพ (${dynamicWidth}x${dynamicHeight}px)...`);

      const canvas = await html2canvas(tempContainer, {
        scale: 2, // High resolution
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: dynamicWidth,
        height: dynamicHeight,
        windowWidth: dynamicWidth + 100,
        windowHeight: dynamicHeight + 100
      });

      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.download = `HPP-Receipt-${order.id}.png`;
      link.href = dataUrl;
      link.click();

      setExportSuccess('ดาวน์โหลด PNG สำเร็จ (ข้อมูลครบถ้วน)');
      setTimeout(() => setExportSuccess(null), 3500);
    } catch (err: any) {
      console.error('Failed to export PNG:', err);
      alert('ไม่สามารถสร้างไฟล์ PNG ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      if (cleanupFn) cleanupFn();
      setIsExportingPng(false);
      setExportProgress(null);
    }
  };

  /**
   * 2. PDF EXPORT (Dynamic Page Height / Page Count / Auto-add Pages / Smart Page Break):
   * - Automatically calculates content height against A4 printable area.
   * - If content exceeds 1 page, dynamically slices canvas across pages without cutting text or images mid-row.
   * - Preserves margins (10mm) and draws header/page indicators.
   */
  const handleDownloadPdf = async () => {
    if (!receiptRef.current) return;
    setIsExportingPdf(true);
    setExportProgress('กำลังประมวลผลเอกสาร PDF...');

    let tempContainer: HTMLElement | null = null;
    let cleanupFn: (() => void) | null = null;

    try {
      const prepared = createRenderableContainer();
      tempContainer = prepared.container;
      cleanupFn = prepared.cleanup;

      // Allow DOM to compute layout
      await new Promise(resolve => requestAnimationFrame(resolve));

      const dynamicWidth = Math.max(780, tempContainer.scrollWidth, tempContainer.offsetWidth);
      const dynamicHeight = Math.max(tempContainer.scrollHeight, tempContainer.offsetHeight) + 20;

      // Render high-res source canvas
      const fullCanvas = await html2canvas(tempContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: dynamicWidth,
        height: dynamicHeight,
        windowWidth: dynamicWidth + 100,
        windowHeight: dynamicHeight + 100
      });

      // A4 geometry in mm
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidthMm = pdf.internal.pageSize.getWidth();   // 210 mm
      const pageHeightMm = pdf.internal.pageSize.getHeight(); // 297 mm
      
      const marginMm = 10;
      const contentWidthMm = pageWidthMm - (marginMm * 2);    // 190 mm
      const contentHeightMm = pageHeightMm - (marginMm * 2);  // 277 mm

      // Canvas pixels to mm ratio
      const pxPerMm = (fullCanvas.width / contentWidthMm);
      const pageHeightPx = contentHeightMm * pxPerMm;

      // Identify natural breakable points (such as between rows/categories)
      // Query rows inside tempContainer to find safe Y boundaries in canvas coordinates
      const rowElements = Array.from(tempContainer.querySelectorAll('tr, .border-b, .receipt-section'));
      const containerRect = tempContainer.getBoundingClientRect();
      const safeBreakPoints: number[] = [];

      rowElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const bottomRelativePx = (rect.bottom - containerRect.top) * 2; // scale factor 2
        safeBreakPoints.push(bottomRelativePx);
      });

      // Calculate slices dynamically
      let currentSourceY = 0;
      const totalCanvasHeight = fullCanvas.height;
      let pageNumber = 1;

      while (currentSourceY < totalCanvasHeight) {
        setExportProgress(`กำลังสร้างหน้า ${pageNumber}...`);

        let targetSliceHeightPx = Math.min(pageHeightPx, totalCanvasHeight - currentSourceY);

        // If not the last page, find the best safe break point to avoid splitting rows
        if (currentSourceY + targetSliceHeightPx < totalCanvasHeight) {
          const desiredBreakY = currentSourceY + targetSliceHeightPx;
          // Look for the closest safe break point that is above desiredBreakY
          const candidates = safeBreakPoints.filter(
            pt => pt > currentSourceY + (pageHeightPx * 0.4) && pt <= desiredBreakY
          );
          if (candidates.length > 0) {
            const bestBreak = Math.max(...candidates);
            targetSliceHeightPx = bestBreak - currentSourceY;
          }
        }

        // Create page slice canvas
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = fullCanvas.width;
        pageCanvas.height = targetSliceHeightPx;
        const pageCtx = pageCanvas.getContext('2d');

        if (pageCtx) {
          pageCtx.fillStyle = '#ffffff';
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          pageCtx.drawImage(
            fullCanvas,
            0,
            currentSourceY,
            fullCanvas.width,
            targetSliceHeightPx,
            0,
            0,
            fullCanvas.width,
            targetSliceHeightPx
          );

          const pageImgData = pageCanvas.toDataURL('image/png', 1.0);
          const sliceHeightMm = (targetSliceHeightPx / fullCanvas.width) * contentWidthMm;

          if (pageNumber > 1) {
            pdf.addPage();
          }

          pdf.addImage(pageImgData, 'PNG', marginMm, marginMm, contentWidthMm, sliceHeightMm);

          // Page footer indicator
          pdf.setFontSize(8);
          pdf.setTextColor(150, 150, 150);
          pdf.text(`หน้า ${pageNumber}`, pageWidthMm - marginMm - 10, pageHeightMm - 5);
        }

        currentSourceY += targetSliceHeightPx;
        pageNumber++;
      }

      pdf.save(`HPP-Receipt-${order.id}.pdf`);
      setExportSuccess(`ดาวน์โหลด PDF สำเร็จ (${pageNumber - 1} หน้า)`);
      setTimeout(() => setExportSuccess(null), 3500);
    } catch (err: any) {
      console.error('Failed to export PDF:', err);
      alert('ไม่สามารถสร้างไฟล์ PDF ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      if (cleanupFn) cleanupFn();
      setIsExportingPdf(false);
      setExportProgress(null);
    }
  };

  const formattedDate = new Date(order.createdAt).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto border border-slate-100">
        
        {/* Header toolbar */}
        <div className="p-4 sm:px-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              ใบรายการสั่งซื้อ
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">#{order.id}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPng}
              disabled={isExportingPng || isExportingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 shadow-xs"
              title="ดาวน์โหลดภาพ PNG (คำนวณขนาดภาพ Dynamic ไม่ตัดข้อมูล)"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {isExportingPng ? 'กำลังสร้าง PNG...' : 'PNG (Dynamic)'}
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={isExportingPng || isExportingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 shadow-xs"
              title="ดาวน์โหลด PDF (แบ่งหน้าอัตโนมัติ ไม่ตัดรูปภาพ)"
            >
              <Download className="w-3.5 h-3.5" />
              {isExportingPdf ? 'กำลังสร้าง PDF...' : 'PDF (หลายหน้า)'}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dynamic Status Banner */}
        {exportProgress && (
          <div className="bg-blue-600 text-white text-xs py-1.5 px-4 text-center font-medium animate-in fade-in flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {exportProgress}
          </div>
        )}

        {exportSuccess && (
          <div className="bg-emerald-500 text-white text-xs py-1.5 px-4 text-center font-medium animate-in fade-in">
            ✓ {exportSuccess}
          </div>
        )}

        {/* Scrollable Receipt Body (Target for dynamic capture) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/70">
          <div 
            ref={receiptRef}
            id="hpp-receipt-content"
            className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 sm:p-8 max-w-xl mx-auto text-slate-900"
          >
            {/* Store & Receipt Title Header */}
            <div className="receipt-section border-b border-slate-200 pb-5 text-center">
              <div className="inline-block bg-emerald-100 text-emerald-800 text-xs px-3 py-1 rounded-full font-semibold uppercase tracking-wider mb-2">
                HPP Ordering System
              </div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                ใบสั่งซื้อสินค้า
              </h2>
              <p className="text-sm font-mono text-slate-500 mt-1 font-semibold">
                เลขที่: {order.id}
              </p>
            </div>

            {/* Info Cards */}
            <div className="receipt-section grid grid-cols-2 gap-3 py-4 border-b border-slate-100 text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-slate-500 text-xs block">ตลาด</span>
                  <span className="font-semibold text-slate-900">{order.marketName}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-slate-500 text-xs block">ผู้สั่ง</span>
                  <span className="font-semibold text-slate-900">{order.userName}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 col-span-2">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-slate-500 text-xs block">วัน/เวลาที่สั่งซื้อ</span>
                  <span className="font-medium text-slate-700">{formattedDate}</span>
                </div>
              </div>

              {order.note && (
                <div className="col-span-2 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200/60 text-amber-900 text-xs">
                  <span className="font-semibold">หมายเหตุ: </span> {order.note}
                </div>
              )}
            </div>

            {/* Items Table - Strict Thai specs: สินค้า | คงเหลือ (Stock) | สั่ง | หน่วย */}
            <div className="receipt-section mt-5">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm text-slate-800">
                  รายการสินค้าที่สั่ง ({order.items.length} รายการ)
                </h4>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-3">สินค้า</th>
                      <th className="py-2.5 px-2 text-right">คงเหลือ</th>
                      <th className="py-2.5 px-3 text-right bg-emerald-50 text-emerald-800">สั่ง</th>
                      <th className="py-2.5 px-3 text-left">หน่วย</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(groupedItems).map(([catName, items]) => (
                      <React.Fragment key={catName}>
                        <tr className="bg-slate-100/60 text-slate-500 text-[11px] font-semibold">
                          <td colSpan={4} className="py-1.5 px-3">
                            📂 {catName}
                          </td>
                        </tr>
                        {items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-2.5 px-3 font-medium text-slate-800">
                              {item.itemName}
                            </td>
                            <td className="py-2.5 px-2 text-right text-slate-500 font-mono">
                              {item.stockAtOrder}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-700 bg-emerald-50/40 font-mono text-sm">
                              {item.quantity}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {item.unit}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Summary & Footer */}
            <div className="receipt-section mt-5 pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
              <div>
                <span>รวมทั้งหมด: </span>
                <span className="font-bold text-slate-900">{order.items.length} รายการ</span>
                <span className="mx-2">•</span>
                <span>จำนวนรวม: </span>
                <span className="font-bold text-emerald-600">{totalQuantity}</span>
              </div>
              <div className="text-right italic text-[11px]">
                บันทึกผ่านระบบ HPP Google Sheets
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
};
