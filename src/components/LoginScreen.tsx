import React, { useState } from 'react';
import { User } from '../types';
import { KeyRound, ShieldAlert, Lock, ArrowRight } from 'lucide-react';

interface LoginScreenProps {
  users: User[];
  onLoginSuccess: (user: User) => void;
  onShowToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ users, onLoginSuccess, onShowToast }) => {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleDigitClick = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMsg(null);
      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    setPin('');
    setErrorMsg(null);
  };

  // Immediate PIN verification - instant response, zero delay!
  const verifyPin = (inputPin: string) => {
    setIsVerifying(true);
    // Exact 4-digit check
    const formattedPin = inputPin.padStart(4, '0');
    
    // Look up in users list
    const foundUser = users.find(u => String(u.pin).padStart(4, '0') === formattedPin);

    if (!foundUser) {
      setErrorMsg('⚠ PIN ไม่ถูกต้อง กรุณาลองใหม่');
      setPin('');
      setIsVerifying(false);
      return;
    }

    if (foundUser.status === 'INACTIVE') {
      setErrorMsg('⚠ บัญชีนี้ถูกปิดใช้งาน (INACTIVE) กรุณาติดต่อผู้ดูแลระบบ');
      setPin('');
      setIsVerifying(false);
      return;
    }

    // Direct transition!
    onLoginSuccess(foundUser);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-emerald-950 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-4 shadow-xl">
            <KeyRound className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            HPP Order & Inventory
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            กรุณากรอกรหัส PIN 4 หลักเพื่อเข้าสู่ระบบ
          </p>
        </div>

        {/* PIN Card */}
        <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-3xl p-6 shadow-2xl text-center">
          {/* PIN Indicators */}
          <div className="flex justify-center items-center gap-4 mb-8">
            {[0, 1, 2, 3].map(i => {
              const filled = pin.length > i;
              return (
                <div
                  key={i}
                  className={`w-5 h-5 rounded-full transition-all duration-150 ${
                    filled
                      ? 'bg-emerald-400 scale-110 shadow-md shadow-emerald-400/50'
                      : 'border-2 border-slate-600 bg-slate-800/50'
                  }`}
                />
              );
            })}
          </div>

          {/* Feedback error */}
          {errorMsg && (
            <div className="mb-6 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-medium animate-in fade-in">
              {errorMsg}
            </div>
          )}

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handleDigitClick(num)}
                disabled={isVerifying}
                className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-emerald-500/30 text-white text-2xl font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400/40 active:scale-95 disabled:opacity-50"
              >
                {num}
              </button>
            ))}

            <button
              type="button"
              onClick={handleClear}
              disabled={isVerifying || pin.length === 0}
              className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold uppercase tracking-wider transition-all focus:outline-none active:scale-95 disabled:opacity-30"
            >
              ล้าง
            </button>

            <button
              type="button"
              onClick={() => handleDigitClick('0')}
              disabled={isVerifying}
              className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-emerald-500/30 text-white text-2xl font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400/40 active:scale-95 disabled:opacity-50"
            >
              0
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={isVerifying || pin.length === 0}
              className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-semibold transition-all focus:outline-none active:scale-95 disabled:opacity-30"
            >
              ←
            </button>
          </div>

          {/* Helper hint for default admin */}
          <div className="mt-8 pt-4 border-t border-white/5 text-[11px] text-slate-400">
            <span>Admin เริ่มต้น PIN: </span>
            <span className="font-mono text-emerald-400 font-semibold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
              0000
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
