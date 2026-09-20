import { Skater, Program, ElementLog } from '../types';

const DB_NAME = 'SkateCoreoDB';
const DB_VERSION = 2;

export interface OfflineSessionRecord {
  id: string; // 'current_offline_session'
  audioBlob: Blob;
  audioFileName: string;
  points: any[];
  programTitle: string;
  savedAt: number;
}

class IndexedDBService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor() {
    this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB no está soportado en este navegador'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. skaters Object Store
        if (!db.objectStoreNames.contains('skaters')) {
          const skatersStore = db.createObjectStore('skaters', { keyPath: 'id' });
          skatersStore.createIndex('category', 'category', { unique: false });
          skatersStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // 2. programs Object Store
        if (!db.objectStoreNames.contains('programs')) {
          const programsStore = db.createObjectStore('programs', { keyPath: 'id' });
          programsStore.createIndex('skater_id', 'skater_id', { unique: false });
          programsStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // 3. elements_log Object Store
        if (!db.objectStoreNames.contains('elements_log')) {
          const elementsStore = db.createObjectStore('elements_log', { keyPath: 'id' });
          elementsStore.createIndex('program_id', 'program_id', { unique: false });
          elementsStore.createIndex('execution_timestamp', 'execution_timestamp', { unique: false });
        }

        // 4. offline_sessions Object Store (Para Modo Avión Zero-Network)
        if (!db.objectStoreNames.contains('offline_sessions')) {
          db.createObjectStore('offline_sessions', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  // Request Persistent Storage for iOS & Android
  public async requestPersistentStorage(): Promise<{ persisted: boolean; quota?: number; usage?: number }> {
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        const persisted = await navigator.storage.persist();
        let estimate;
        if (navigator.storage.estimate) {
          estimate = await navigator.storage.estimate();
        }
        return {
          persisted,
          quota: estimate?.quota,
          usage: estimate?.usage
        };
      } else {
        let estimate;
        if (navigator.storage.estimate) {
          estimate = await navigator.storage.estimate();
        }
        return {
          persisted: true,
          quota: estimate?.quota,
          usage: estimate?.usage
        };
      }
    }
    return { persisted: false };
  }

  public async isStoragePersisted(): Promise<boolean> {
    if (navigator.storage && navigator.storage.persisted) {
      return await navigator.storage.persisted();
    }
    return false;
  }

  // Generic transaction helper
  private async executeTx<T>(
    storeName: 'skaters' | 'programs' | 'elements_log',
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<any>
  ): Promise<T> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = operation(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // --- SKATERS ---
  public async getAllSkaters(): Promise<Skater[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('skaters', 'readonly');
      const store = tx.objectStore('skaters');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async getSkater(id: string): Promise<Skater | undefined> {
    return this.executeTx<Skater>('skaters', 'readonly', (store) => store.get(id));
  }

  public async saveSkater(skater: Skater): Promise<void> {
    await this.executeTx('skaters', 'readwrite', (store) => store.put(skater));
  }

  public async deleteSkater(id: string): Promise<void> {
    await this.executeTx('skaters', 'readwrite', (store) => store.delete(id));
    // Also delete associated programs and elements
    const programs = await this.getProgramsBySkater(id);
    for (const p of programs) {
      await this.deleteProgram(p.id);
    }
  }

  // --- PROGRAMS ---
  public async getAllPrograms(): Promise<Program[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('programs', 'readonly');
      const store = tx.objectStore('programs');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async getProgram(id: string): Promise<Program | undefined> {
    return this.executeTx<Program>('programs', 'readonly', (store) => store.get(id));
  }

  public async getProgramsBySkater(skaterId: string): Promise<Program[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('programs', 'readonly');
      const store = tx.objectStore('programs');
      const index = store.index('skater_id');
      const req = index.getAll(skaterId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async saveProgram(program: Program): Promise<void> {
    await this.executeTx('programs', 'readwrite', (store) => store.put(program));
  }

  public async deleteProgram(id: string): Promise<void> {
    await this.executeTx('programs', 'readwrite', (store) => store.delete(id));
    // Also delete element logs
    const elements = await this.getElementsByProgram(id);
    for (const el of elements) {
      await this.deleteElement(el.id);
    }
  }

  // --- ELEMENTS LOG ---
  public async getElementsByProgram(programId: string): Promise<ElementLog[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('elements_log', 'readonly');
      const store = tx.objectStore('elements_log');
      const index = store.index('program_id');
      const req = index.getAll(programId);
      req.onsuccess = () => {
        const sorted = (req.result || []).sort((a: ElementLog, b: ElementLog) => 
          a.execution_timestamp - b.execution_timestamp
        );
        resolve(sorted);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async saveElement(element: ElementLog): Promise<void> {
    await this.executeTx('elements_log', 'readwrite', (store) => store.put(element));
  }

  public async deleteElement(id: string): Promise<void> {
    await this.executeTx('elements_log', 'readwrite', (store) => store.delete(id));
  }

  public async clearElementsByProgram(programId: string): Promise<void> {
    const elements = await this.getElementsByProgram(programId);
    for (const el of elements) {
      await this.deleteElement(el.id);
    }
  }

  // --- EXPORT & IMPORT (Full JSON backup) ---
  public async exportAllData(): Promise<string> {
    const skaters = await this.getAllSkaters();
    const programs = await this.getAllPrograms();
    
    // Strip raw audio binary for lightweight json export or keep metadata
    const sanitizedPrograms = programs.map(p => ({
      ...p,
      audio_blob: undefined // blobs export separately to prevent massive json strings
    }));

    const db = await this.initDB();
    const elements: ElementLog[] = await new Promise((resolve, reject) => {
      const tx = db.transaction('elements_log', 'readonly');
      const req = tx.objectStore('elements_log').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const exportBundle = {
      version: '1.0.0',
      exported_at: Date.now(),
      system: 'RollArt SkateCoreo PWA',
      skaters,
      programs: sanitizedPrograms,
      elements
    };

    return JSON.stringify(exportBundle, null, 2);
  }

  public async importData(jsonString: string): Promise<{ skatersCount: number; programsCount: number; elementsCount: number }> {
    const data = JSON.parse(jsonString);
    if (!data.skaters || !Array.isArray(data.skaters)) {
      throw new Error('Formato JSON inválido: falta lista de patinadores');
    }

    for (const skater of data.skaters) {
      await this.saveSkater(skater);
    }

    if (data.programs && Array.isArray(data.programs)) {
      for (const prog of data.programs) {
        await this.saveProgram(prog);
      }
    }

    if (data.elements && Array.isArray(data.elements)) {
      for (const el of data.elements) {
        await this.saveElement(el);
      }
    }

    return {
      skatersCount: data.skaters.length,
      programsCount: data.programs?.length || 0,
      elementsCount: data.elements?.length || 0
    };
  }

  // Seed sample initial data if database is empty, or backfill missing choreography paths
  public async seedInitialData(): Promise<void> {
    const existing = await this.getAllSkaters();
    if (existing.length > 0) {
      // Backfill choreography_path if existing programs lack points
      try {
        const progs = await this.getAllPrograms();
        for (const prog of progs) {
          if (!prog.choreography_path || prog.choreography_path.length < 2) {
            prog.choreography_path = [
              { id: 'pt-1', x: 6, y: 12.5, time_ms: 0, cp1x: 10, cp1y: 4.5, cp2x: 18, cp2y: 20.5, label: '', isMainNode: true },
              { id: 'pt-2', x: 25, y: 21, time_ms: 30000, cp1x: 32, cp1y: 21, cp2x: 38, cp2y: 9, label: 'Secuencia Pasos', isMainNode: true },
              { id: 'pt-3', x: 44, y: 7, time_ms: 60000, cp1x: 46, cp1y: 16, cp2x: 38, cp2y: 19, label: '3Lo Entrada', isMainNode: true },
              { id: 'pt-4', x: 25, y: 12.5, time_ms: 90000, cp1x: 18, cp1y: 9, cp2x: 12, cp2y: 16, label: 'Spin Combo [T]', isMainNode: true },
              { id: 'pt-5', x: 12, y: 18, time_ms: 120000, cp1x: 20, cp1y: 22, cp2x: 35, cp2y: 21, label: '3Lz Pre-check [T]', isMainNode: true },
              { id: 'pt-6', x: 40, y: 12.5, time_ms: 150000, cp1x: 36, cp1y: 12.5, cp2x: 40, cp2y: 12.5, label: '', isMainNode: true }
            ];
            await this.saveProgram(prog);
          }
        }
      } catch (err) {}
      return;
    }

    const sampleSkater: Skater = {
      id: 'skater-senior-001',
      name: 'Sofía Valenzuela',
      category: 'Senior',
      club: 'Club Patín Olímpico',
      country: 'ES',
      created_at: Date.now() - 86400000 * 5
    };

    const sampleSkaterCadet: Skater = {
      id: 'skater-cadet-002',
      name: 'Mateo Rossi',
      category: 'Cadet',
      club: 'Artistic Roll Academy',
      country: 'IT',
      created_at: Date.now() - 86400000 * 2
    };

    await this.saveSkater(sampleSkater);
    await this.saveSkater(sampleSkaterCadet);

    const programDuration = 240000; // 4 minutes
    const sampleProgram: Program = {
      id: 'prog-senior-free-001',
      skater_id: sampleSkater.id,
      title: 'Programa Largo Senior - Libertango',
      duration_ms: programDuration,
      half_time_ms: 120000, // 2 minutes half-time for "T" factor
      choreography_path: [
        { id: 'pt-1', x: 6, y: 12.5, time_ms: 0, cp1x: 10, cp1y: 4.5, cp2x: 18, cp2y: 20.5, label: '', isMainNode: true },
        { id: 'pt-2', x: 25, y: 21, time_ms: 30000, cp1x: 32, cp1y: 21, cp2x: 38, cp2y: 9, label: 'Secuencia Pasos', isMainNode: true },
        { id: 'pt-3', x: 44, y: 7, time_ms: 60000, cp1x: 46, cp1y: 16, cp2x: 38, cp2y: 19, label: '3Lo Entrada', isMainNode: true },
        { id: 'pt-4', x: 25, y: 12.5, time_ms: 90000, cp1x: 18, cp1y: 9, cp2x: 12, cp2y: 16, label: 'Spin Combo [T]', isMainNode: true },
        { id: 'pt-5', x: 12, y: 18, time_ms: 120000, cp1x: 20, cp1y: 22, cp2x: 35, cp2y: 21, label: '3Lz Pre-check [T]', isMainNode: true },
        { id: 'pt-6', x: 40, y: 12.5, time_ms: 150000, cp1x: 36, cp1y: 12.5, cp2x: 40, cp2y: 12.5, label: '', isMainNode: true }
      ],
      created_at: Date.now() - 86400000
    };

    await this.saveProgram(sampleProgram);
  }

  // ── Offline Zero-Network Session Storage ───────────────────────
  public async saveOfflineSession(session: OfflineSessionRecord): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_sessions', 'readwrite');
      const store = tx.objectStore('offline_sessions');
      const request = store.put(session);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public async getOfflineSession(): Promise<OfflineSessionRecord | null> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_sessions', 'readonly');
      const store = tx.objectStore('offline_sessions');
      const request = store.get('current_offline_session');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
}

export const dbService = new IndexedDBService();


