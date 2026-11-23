import { useEffect, useState } from 'react';
import { Download, RotateCw, Share, WifiOff, X } from 'lucide-react';
import { isTouchCapableDevice } from '../game/touchControls';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  });
  const [isIOS] = useState<boolean>(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
  });

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice.outcome;
  };

  return {
    canInstall: !isInstalled && (deferredPrompt !== null || isIOS),
    isInstalled,
    isIOS: isIOS && !deferredPrompt,
    promptInstall,
  };
}

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { canInstall, isIOS, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (!canInstall) return null;

  const handleClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }
    await promptInstall();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-1.5 rounded-xl border border-amber-400/35 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 font-bold transition cursor-pointer ${
          compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
        }`}
        title="Install Apex Miniature for fullscreen & offline play"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#0e1420] border border-white/15 p-5 text-white shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-black uppercase tracking-wider text-amber-300">
                Install on iOS
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-white/75 leading-relaxed">
              Tap the <span className="inline-flex items-center gap-1 font-bold text-white"><Share className="w-3.5 h-3.5 text-sky-400" /> Share</span> button
              in Safari, then choose <span className="font-bold text-white">Add to Home Screen</span> to launch Apex Miniature fullscreen.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2 rounded-xl bg-amber-400 text-black font-black text-xs uppercase tracking-wider"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const [offline, setOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[65] pointer-events-none flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-950/90 border border-amber-400/40 text-amber-200 text-xs font-semibold shadow-xl backdrop-blur-md">
      <WifiOff className="w-3.5 h-3.5 text-amber-300" />
      <span>Offline Mode — Solo racing & studios remain available</span>
    </div>
  );
}

export function LandscapeMobileBanner({ active }: { active: boolean }) {
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!active || !isTouchCapableDevice()) {
      setIsPortraitMobile(false);
      return;
    }
    const check = () => {
      setIsPortraitMobile(window.innerHeight > window.innerWidth && window.innerWidth < 768);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, [active]);

  if (!active || !isPortraitMobile || dismissed) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[64] flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#0d1320]/95 border border-sky-400/40 text-xs text-sky-100 shadow-xl backdrop-blur-md">
      <RotateCw className="w-4 h-4 text-sky-300 shrink-0" />
      <span>Rotate to landscape for best racing view &amp; touch pedals</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="p-0.5 rounded hover:bg-white/10 text-white/70"
        aria-label="Dismiss orientation tip"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
