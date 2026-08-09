import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { storage } from '../lib/storage';
import { storageLocal } from '../lib/storageLocal';
import { debounce, type Debounced } from '../lib/debounce';
import { BackgroundConfig, DEFAULT_BG } from '../types/background';
import { resolveBackgroundCss } from '../components/Background/providers';
import { useSettings } from './SettingsContext';
import { useUnsplash, UnsplashAttribution } from '../hooks/useUnsplash';
import { useBing } from '../hooks/useBing';
import { useAstronomy } from '../hooks/useAstronomy';
import { useWikimedia } from '../hooks/useWikimedia';

const SYNC_KEY          = 'sg:background';
const LOCAL_KEY         = 'sg:background:image';
// Both keys use plain localStorage for synchronous first-render fast-paths,
// eliminating the white flash caused by async storage.sync / storage.local hydration.
const FAST_CONFIG_KEY   = 'sg:bg:fastConfig';
const FAST_URL_KEY      = 'sg:unsplash:fastUrl';
const FAST_BING_URL_KEY = 'sg:bing:fastUrl';
const FAST_APOD_URL_KEY = 'sg:apod:fastUrl';
const FAST_WIKIMEDIA_URL_KEY = 'sg:wikimedia:fastUrl';

function readFastConfig(): BackgroundConfig | null {
  try {
    const raw = localStorage.getItem(FAST_CONFIG_KEY);
    return raw ? (JSON.parse(raw) as BackgroundConfig) : null;
  } catch { return null; }
}
function writeFastConfig(cfg: BackgroundConfig): void {
  try { localStorage.setItem(FAST_CONFIG_KEY, JSON.stringify(cfg)); } catch {}
}

function readFastUrl(): string | null {
  try { return localStorage.getItem(FAST_URL_KEY); } catch { return null; }
}
function writeFastUrl(url: string | null): void {
  try {
    if (url) localStorage.setItem(FAST_URL_KEY, url);
    else localStorage.removeItem(FAST_URL_KEY);
  } catch {}
}

function readFastBingUrl(): string | null {
  try { return localStorage.getItem(FAST_BING_URL_KEY); } catch { return null; }
}
function writeFastBingUrl(url: string | null): void {
  try {
    if (url) localStorage.setItem(FAST_BING_URL_KEY, url);
    else localStorage.removeItem(FAST_BING_URL_KEY);
  } catch {}
}

function readFastApodUrl(): string | null {
  try { return localStorage.getItem(FAST_APOD_URL_KEY); } catch { return null; }
}
function writeFastApodUrl(url: string | null): void {
  try {
    if (url) localStorage.setItem(FAST_APOD_URL_KEY, url);
    else localStorage.removeItem(FAST_APOD_URL_KEY);
  } catch {}
}

function readFastWikimediaUrl(): string | null {
  try { return localStorage.getItem(FAST_WIKIMEDIA_URL_KEY); } catch { return null; }
}
function writeFastWikimediaUrl(url: string | null): void {
  try {
    if (url) localStorage.setItem(FAST_WIKIMEDIA_URL_KEY, url);
    else localStorage.removeItem(FAST_WIKIMEDIA_URL_KEY);
  } catch {}
}

interface BackgroundCtx {
  config: BackgroundConfig;
  customImageUrl: string | null;
  loaded: boolean;
  setConfig: (cfg: BackgroundConfig) => void;
  setCustomImage: (dataUrl: string) => void;
  clearCustomImage: () => void;
  backgroundCss: string;
  unsplash: {
    imageUrl: string | null;
    attribution: UnsplashAttribution | null;
    isFetching: boolean;
    error: string | null;
    fetchNow: () => void;
  };
  bing: {
    imageUrl: string | null;
    title: string | undefined;
    isFetching: boolean;
    error: string | null;
    fetchNow: () => void;
  };
  astronomy: {
    imageUrl: string | null;
    title: string | undefined;
    copyright: string | undefined;
    isFetching: boolean;
    error: string | null;
    fetchNow: () => void;
  };
  wikimedia: {
    imageUrl: string | null;
    title: string | undefined;
    artist: string | undefined;
    isFetching: boolean;
    error: string | null;
    fetchNow: () => void;
  };
}

const Ctx = createContext<BackgroundCtx | null>(null);

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const { colorScheme } = useSettings();
  const isDark = colorScheme !== 'light';

  // Initialise synchronously from localStorage fast-path — avoids first-frame flash
  const [config, setConfigState]            = useState<BackgroundConfig>(() => readFastConfig() ?? DEFAULT_BG);
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(null);
  const [unsplashImageUrl, setUnsplashImageUrlRaw] = useState<string | null>(readFastUrl);
  const [bingImageUrl, setBingImageUrlRaw]  = useState<string | null>(readFastBingUrl);
  const [apodImageUrl, setApodImageUrlRaw]  = useState<string | null>(readFastApodUrl);
  const [wikimediaImageUrl, setWikimediaImageUrlRaw] = useState<string | null>(readFastWikimediaUrl);
  const [loaded, setLoaded]                 = useState(false);
  const lastSaved                           = useRef('');
  const debouncedSyncSave                   = useRef<Debounced<[BackgroundConfig]> | null>(null);
  if (!debouncedSyncSave.current) {
    debouncedSyncSave.current = debounce((cfg: BackgroundConfig) => storage.set(SYNC_KEY, cfg), 400);
  }

  const setUnsplashImageUrl = (url: string | null) => {
    setUnsplashImageUrlRaw(url);
    writeFastUrl(url);
  };

  const setBingImageUrl = (url: string | null) => {
    setBingImageUrlRaw(url);
    writeFastBingUrl(url);
  };

  const setApodImageUrl = (url: string | null) => {
    setApodImageUrlRaw(url);
    writeFastApodUrl(url);
  };

  const setWikimediaImageUrl = (url: string | null) => {
    setWikimediaImageUrlRaw(url);
    writeFastWikimediaUrl(url);
  };

  const { attribution, isFetching, error, fetchNow } = useUnsplash(config, setUnsplashImageUrl);
  const { title: bingTitle, isFetching: bingFetching, error: bingError, fetchNow: bingFetchNow } = useBing(config, setBingImageUrl);
  const { title: apodTitle, copyright: apodCopyright, isFetching: apodFetching, error: apodError, fetchNow: apodFetchNow } = useAstronomy(config, setApodImageUrl);
  const { title: wikimediaTitle, artist: wikimediaArtist, isFetching: wikimediaFetching, error: wikimediaError, fetchNow: wikimediaFetchNow } = useWikimedia(config, setWikimediaImageUrl);

  // Hydrate from real storage (sync + local) on mount
  useEffect(() => {
    Promise.all([
      storage.get(SYNC_KEY),
      storageLocal.get(LOCAL_KEY),
    ]).then(([cfg, img]) => {
      if (cfg) {
        const c = cfg as BackgroundConfig;
        lastSaved.current = JSON.stringify(c);
        setConfigState(c);
        writeFastConfig(c);
      }
      if (img) setCustomImageUrl(img as string);
      setLoaded(true);
    });
  }, []);

  // Persist config changes to storage.sync + localStorage fast-path.
  // storage.sync writes are debounced — chrome.storage.sync enforces
  // MAX_WRITE_OPERATIONS_PER_MINUTE (120/min), and a continuous control like
  // the gradient color pickers can fire far more config changes than that
  // per minute while dragging. The localStorage fast-path write stays
  // immediate since it's local, not quota-limited, and is what avoids the
  // first-paint flash on next load.
  useEffect(() => {
    if (!loaded) return;
    const serialized = JSON.stringify(config);
    if (serialized === lastSaved.current) return;
    lastSaved.current = serialized;
    writeFastConfig(config);
    debouncedSyncSave.current!(config);
  }, [config, loaded]);

  const setConfig = (cfg: BackgroundConfig) => {
    setConfigState(cfg);
    writeFastConfig(cfg); // write immediately so fast-path is always current
  };

  const setCustomImage = (dataUrl: string) => {
    setCustomImageUrl(dataUrl);
    storageLocal.set(LOCAL_KEY, dataUrl);
    setConfig({ mode: 'custom', value: '' });
  };

  const clearCustomImage = () => {
    setCustomImageUrl(null);
    storageLocal.remove(LOCAL_KEY);
    setConfig(DEFAULT_BG);
  };

  const backgroundCss = resolveBackgroundCss(config, {
    isDark,
    customImageUrl,
    unsplashImageUrl,
    bingImageUrl,
    apodImageUrl,
    wikimediaImageUrl,
  });

  return (
    <Ctx.Provider value={{
      config, customImageUrl, loaded,
      setConfig, setCustomImage, clearCustomImage,
      backgroundCss,
      unsplash: { imageUrl: unsplashImageUrl, attribution, isFetching, error, fetchNow },
      bing: { imageUrl: bingImageUrl, title: bingTitle, isFetching: bingFetching, error: bingError, fetchNow: bingFetchNow },
      astronomy: { imageUrl: apodImageUrl, title: apodTitle, copyright: apodCopyright, isFetching: apodFetching, error: apodError, fetchNow: apodFetchNow },
      wikimedia: { imageUrl: wikimediaImageUrl, title: wikimediaTitle, artist: wikimediaArtist, isFetching: wikimediaFetching, error: wikimediaError, fetchNow: wikimediaFetchNow },
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBackground() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBackground must be used within BackgroundProvider');
  return ctx;
}
