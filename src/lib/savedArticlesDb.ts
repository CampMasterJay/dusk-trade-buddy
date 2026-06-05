// IndexedDB-backed store for "saved" news articles (max 5).
// Available offline; sync across components via a custom DOM event.

import type { Article } from "./newsData";

const DB_NAME = "edgetrader-news";
const DB_VERSION = 1;
const STORE = "saved-articles";
export const SAVED_MAX = 5;
const CHANGE_EVENT = "edgetrader:saved-articles-changed";

export type SavedArticle = Article & { savedAt: number };

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    Promise.resolve(work(store))
      .then((res) => {
        transaction.oncomplete = () => resolve(res);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      })
      .catch(reject);
  });
}

function emitChange() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function subscribeSavedArticles(listener: () => void): () => void {
  if (!isBrowser()) return () => {};
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export async function getSavedArticles(): Promise<SavedArticle[]> {
  if (!isBrowser()) return [];
  try {
    return await tx("readonly", (store) => {
      return new Promise<SavedArticle[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () =>
          resolve(
            ((req.result as SavedArticle[]) ?? []).sort(
              (a, b) => b.savedAt - a.savedAt,
            ),
          );
        req.onerror = () => reject(req.error);
      });
    });
  } catch {
    return [];
  }
}

export async function isArticleSaved(id: string): Promise<boolean> {
  if (!isBrowser()) return false;
  try {
    return await tx("readonly", (store) => {
      return new Promise<boolean>((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => resolve(Boolean(req.result));
        req.onerror = () => reject(req.error);
      });
    });
  } catch {
    return false;
  }
}

export type SaveResult = "saved" | "removed" | "limit_reached";

export async function toggleSavedArticle(article: Article): Promise<SaveResult> {
  if (!isBrowser()) return "removed";
  const all = await getSavedArticles();
  const existing = all.find((a) => a.id === article.id);
  if (existing) {
    await tx("readwrite", (store) => {
      store.delete(article.id);
    });
    emitChange();
    return "removed";
  }
  if (all.length >= SAVED_MAX) {
    return "limit_reached";
  }
  const payload: SavedArticle = { ...article, savedAt: Date.now() };
  await tx("readwrite", (store) => {
    store.put(payload);
  });
  emitChange();
  return "saved";
}

export async function clearAllSavedArticles(): Promise<void> {
  if (!isBrowser()) return;
  await tx("readwrite", (store) => {
    store.clear();
  });
  emitChange();
}