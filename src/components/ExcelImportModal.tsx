import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Item, Category } from '../types';
import { Upload, FileSpreadsheet, Check, AlertCircle } from 'lucide-react';
import { Dialog } from './Dialog';

interface ExcelImportModalProps {
  isOpen: boolean;
  categories: Category[];
  existingItems: Item[];
  onClose: () => void;
  onImportComplete: (newCategories: Category[], newItems: Item[]) => Promise<void>;
  onShowToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  categories,
  existingItems,
  onClose,
  onImportComplete,
  onShowToast
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedData, setParsedData] = useState<{
    newCategories: Category[];
    itemsToCreate: Item[];
    summary: { totalRows: number; skippedDuplicates: number; newCategoriesCount: number };
  } | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorText(null);
    setFileName(file.name);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!rows || rows.length <= 1) {
          setErrorText('⚠ ไฟล์ไม่มีข้อมูลสินค้า');
          setIsProcessing(false);
          return;
        }

        // Header mapping (Thai & English)
        const headerRow = rows[0].map((h: any) => String(h || '').trim().toLowerCase());
        
        let nameIdx = -1;
        let catIdx = -1;
        let stockIdx = -1;
        let unitIdx = -1;

        headerRow.forEach((col: string, idx: number) => {
          if (col.includes('ชื่อ') || col.includes('name') || col.includes('item') || col.includes('สินค้า')) {
            if (nameIdx === -1) nameIdx = idx;
          }
          if (col.includes('หมวด') || col.includes('category') || col.includes('cat')) {
            if (catIdx === -1) catIdx = idx;
          }
          if (col.includes('stock') || col.includes('สต็อก') || col.includes('คงเหลือ') || col.includes('จำนวน')) {
            if (stockIdx === -1) stockIdx = idx;
          }
          if (col.includes('หน่วย') || col.includes('unit')) {
            if (unitIdx === -1) unitIdx = idx;
          }
        });

        // Fallback default index if headers are simple
        if (nameIdx === -1) nameIdx = 0;
        if (catIdx === -1 && headerRow.length > 1) catIdx = 1;
        if (stockIdx === -1 && headerRow.length > 2) stockIdx = 2;
        if (unitIdx === -1 && headerRow.length > 3) unitIdx = 3;

        // Process rows according to rule 3:
        // 1. Must never fail if category column is missing or blank
        // 2. If category name exists in file, use it
        // 3. If category doesn't exist yet in system, create it automatically
        // 4. If category blank, assign to fallback "ทั่วไป"
        // 5. Prevent unnecessary duplicates
        const dynamicCategories = [...categories];
        const itemsToCreate: Item[] = [];
        let skippedDuplicates = 0;
        let createdCatsCount = 0;

        // Helper to find or add category
        const findOrCreateCategory = (rawCatName: string): string => {
          const trimmed = (rawCatName || '').trim() || 'ทั่วไป';
          let found = dynamicCategories.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
          if (!found) {
            const newCat: Category = {
              id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              name: trimmed,
              createdAt: new Date().toISOString()
            };
            dynamicCategories.push(newCat);
            createdCatsCount++;
            return newCat.id;
          }
          return found.id;
        };

        const existingItemKeys = new Set(
          existingItems.map(i => `${i.name.trim().toLowerCase()}_${i.categoryId}`)
        );

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const rawName = row[nameIdx];
          if (!rawName) continue; // Skip blank lines

          const name = String(rawName).trim();
          const rawCat = catIdx !== -1 ? String(row[catIdx] || '').trim() : '';
          const categoryId = findOrCreateCategory(rawCat);

          const stockVal = stockIdx !== -1 ? Number(row[stockIdx]) : 0;
          const stock = isNaN(stockVal) ? 0 : Math.max(0, stockVal);

          const rawUnit = unitIdx !== -1 ? String(row[unitIdx] || '').trim() : '';
          const unit = rawUnit || 'ชิ้น';

          const itemKey = `${name.toLowerCase()}_${categoryId}`;
          if (existingItemKeys.has(itemKey)) {
            skippedDuplicates++;
            continue;
          }

          existingItemKeys.add(itemKey);
          itemsToCreate.push({
            id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name,
            categoryId,
            stock,
            unit,
            updatedAt: new Date().toISOString()
          });
        }

        const newCatsOnly = dynamicCategories.filter(
          dc => !categories.some(orig => orig.id === dc.id)
        );

        setParsedData({
          newCategories: newCatsOnly,
          itemsToCreate,
          summary: {
            totalRows: rows.length - 1,
            skippedDuplicates,
            newCategoriesCount: newCatsOnly.length
          }
        });
      } catch (err: any) {
        console.error('Excel parse error:', err);
        setErrorText('⚠ ไม่สามารถอ่านไฟล์ Excel ได้ กรุณาตรวจสอบรูปแบบไฟล์');
      } finally {
        setIsProcessing(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = async () => {
    if (!parsedData) return;
    setIsProcessing(true);
    try {
      await onImportComplete(parsedData.newCategories, parsedData.itemsToCreate);
      onShowToast('success', `✓ นำเข้าสินค้าสำเร็จ ${parsedData.itemsToCreate.length} รายการ`);
      onClose();
    } catch (err: any) {
      setErrorText('⚠ เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="นำเข้าสินค้าจากไฟล์ Excel"
      confirmLabel={isProcessing ? 'กำลังนำเข้า...' : 'ยืนยันนำเข้าข้อมูล'}
      confirmVariant="primary"
      isLoading={isProcessing}
      onConfirm={handleConfirmImport}
      onCancel={onClose}
    >
      <div className="space-y-4">
        {/* Upload Box */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-6 text-center cursor-pointer bg-slate-50/50 hover:bg-emerald-50/30 transition-all"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            onChange={handleFileUpload}
          />
          <FileSpreadsheet className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-800">
            {fileName ? fileName : 'คลิกเพื่อเลือกไฟล์ Excel (.xlsx, .xls)'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            รองรับคอลัมน์: ชื่อ, หมวดหมู่, stock, หน่วย
          </p>
        </div>

        {errorText && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorText}</span>
          </div>
        )}

        {/* Preview Summary */}
        {parsedData && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2">
            <div className="font-semibold text-slate-800">สรุปข้อมูลที่จะนำเข้า:</div>
            <div className="flex justify-between text-slate-600">
              <span>รายการสินค้าใหม่:</span>
              <span className="font-bold text-emerald-700">{parsedData.itemsToCreate.length} รายการ</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>หมวดหมู่ที่จะสร้างใหม่อัตโนมัติ:</span>
              <span className="font-bold text-slate-800">{parsedData.summary.newCategoriesCount} หมวดหมู่</span>
            </div>
            {parsedData.summary.skippedDuplicates > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>ข้ามรายการที่ซ้ำ:</span>
                <span>{parsedData.summary.skippedDuplicates} รายการ</span>
              </div>
            )}

            {/* Sample items */}
            {parsedData.itemsToCreate.length > 0 && (
              <div className="mt-3 pt-2 border-t border-slate-200">
                <span className="text-slate-500 block mb-1">ตัวอย่างรายการ:</span>
                <div className="max-h-28 overflow-y-auto divide-y divide-slate-200 font-mono text-[11px]">
                  {parsedData.itemsToCreate.slice(0, 5).map(it => (
                    <div key={it.id} className="py-1 flex justify-between">
                      <span className="truncate max-w-[180px]">{it.name}</span>
                      <span>{it.stock} {it.unit}</span>
                    </div>
                  ))}
                  {parsedData.itemsToCreate.length > 5 && (
                    <div className="py-1 text-slate-400 italic">
                      ...และอีก {parsedData.itemsToCreate.length - 5} รายการ
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
};
