/**
 * coachDb.ts — Base de datos local-first de alta resiliencia para el Panel de Entrenadores
 *
 * Utiliza IndexedDB con soporte de persistencia (Origin Private File System / Storage API)
 * y almacena:
 *  - Atletas y fichas deportivas
 *  - Coreografías asociadas y sus versiones
 *  - Archivos binarios (.coreo) y fotos/avatares
 *  - Perfil del entrenador y credenciales seguras de nube
 *
 * Sin utilizar Supabase Storage.
 */

import { CoachAthlete, CoachChoreography, CoachProfile, CoachEvaluation } from '../types';
import { dbService } from '../../services/db';

const COACH_DB_NAME = 'SkateCoreoCoachDB';
const COACH_DB_VERSION = 2;

export interface StoredBinaryFile {
  id: string;
  name: string;
  mimeType: string;
  blob: Blob;
  size: number;
  savedAt: number;
  athleteId?: string;
  choreographyId?: string;
  versionNumber?: number;
}

class CoachDatabaseService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  // Fallback en memoria para entornos de prueba / SSR
  private memAthletes: Map<string, CoachAthlete> = new Map();
  private memChoreos: Map<string, CoachChoreography> = new Map();
  private memFiles: Map<string, StoredBinaryFile> = new Map();
  private memEvaluations: Map<string, CoachEvaluation> = new Map();
  private memProfile: CoachProfile | null = null;

  private isIndexedDbAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.indexedDB;
  }

  private initDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (!this.isIndexedDbAvailable()) {
        reject(new Error('IndexedDB no está disponible en este entorno'));
        return;
      }

      const request = indexedDB.open(COACH_DB_NAME, COACH_DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. Atletas del entrenador
        if (!db.objectStoreNames.contains('athletes')) {
          const athleteStore = db.createObjectStore('athletes', { keyPath: 'id' });
          athleteStore.createIndex('category', 'category', { unique: false });
          athleteStore.createIndex('club', 'club', { unique: false });
          athleteStore.createIndex('updated_at', 'updated_at', { unique: false });
          athleteStore.createIndex('name', 'name', { unique: false });
        }

        // 2. Coreografías asociadas a atletas
        if (!db.objectStoreNames.contains('choreographies')) {
          const choreoStore = db.createObjectStore('choreographies', { keyPath: 'id' });
          choreoStore.createIndex('athleteId', 'athleteId', { unique: false });
          choreoStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // 3. Archivos binarios (.coreo y fotos)
        if (!db.objectStoreNames.contains('files')) {
          const filesStore = db.createObjectStore('files', { keyPath: 'id' });
          filesStore.createIndex('athleteId', 'athleteId', { unique: false });
          filesStore.createIndex('choreographyId', 'choreographyId', { unique: false });
        }

        // 4. Perfil y ajustes del entrenador
        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile', { keyPath: 'trainerId' });
        }

        // 5. Evaluaciones del Panel Técnico
        if (!db.objectStoreNames.contains('evaluations')) {
          const evalStore = db.createObjectStore('evaluations', { keyPath: 'id' });
          evalStore.createIndex('athleteId', 'athleteId', { unique: false });
          evalStore.createIndex('choreographyId', 'choreographyId', { unique: false });
          evalStore.createIndex('date', 'date', { unique: false });
          evalStore.createIndex('trainerId', 'trainerId', { unique: false });
          evalStore.createIndex('updated_at', 'updated_at', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  // ── ATLETAS ──────────────────────────────────────────────

  public async getAllAthletes(): Promise<CoachAthlete[]> {
    if (!this.isIndexedDbAvailable()) {
      return Array.from(this.memAthletes.values());
    }
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('athletes', 'readonly');
        const store = tx.objectStore('athletes');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return Array.from(this.memAthletes.values());
    }
  }

  public async getAthleteById(id: string): Promise<CoachAthlete | null> {
    if (!this.isIndexedDbAvailable()) {
      return this.memAthletes.get(id) || null;
    }
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('athletes', 'readonly');
        const store = tx.objectStore('athletes');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.memAthletes.get(id) || null;
    }
  }

  public async saveAthlete(athlete: CoachAthlete): Promise<void> {
    this.memAthletes.set(athlete.id, athlete);

    if (this.isIndexedDbAvailable()) {
      const db = await this.initDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('athletes', 'readwrite');
        const store = tx.objectStore('athletes');
        const req = store.put(athlete);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    // Espejo retrocompatible con dbService para interoperabilidad de SkateCoreo
    try {
      await dbService.saveSkater({
        id: athlete.id,
        name: athlete.name,
        category: athlete.category,
        club: athlete.club,
        age: athlete.age,
        eficiencia: athlete.eficiencia,
        created_at: athlete.created_at,
      });
    } catch {
      // Ignorar si dbService no está disponible en tests
    }
  }

  public async deleteAthlete(id: string): Promise<void> {
    this.memAthletes.delete(id);

    // Eliminar también coreografías y archivos asociados
    const choreos = await this.getChoreographiesByAthlete(id);
    for (const ch of choreos) {
      await this.deleteChoreography(ch.id);
    }

    // Eliminar también evaluaciones técnicas asociadas
    const evals = await this.getEvaluationsByAthlete(id);
    for (const ev of evals) {
      await this.deleteEvaluation(ev.id);
    }

    if (this.isIndexedDbAvailable()) {
      const db = await this.initDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('athletes', 'readwrite');
        const store = tx.objectStore('athletes');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    try {
      await dbService.deleteSkater(id);
    } catch {}
  }

  // ── COREOGRAFÍAS ──────────────────────────────────────────

  public async getChoreographiesByAthlete(athleteId: string): Promise<CoachChoreography[]> {
    if (!this.isIndexedDbAvailable()) {
      return Array.from(this.memChoreos.values()).filter((c) => c.athleteId === athleteId);
    }
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('choreographies', 'readonly');
        const store = tx.objectStore('choreographies');
        const index = store.index('athleteId');
        const req = index.getAll(athleteId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return Array.from(this.memChoreos.values()).filter((c) => c.athleteId === athleteId);
    }
  }

  public async getChoreographyById(id: string): Promise<CoachChoreography | null> {
    if (!this.isIndexedDbAvailable()) {
      return this.memChoreos.get(id) || null;
    }
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('choreographies', 'readonly');
        const store = tx.objectStore('choreographies');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.memChoreos.get(id) || null;
    }
  }

  public async getAllChoreographies(): Promise<CoachChoreography[]> {
    if (!this.isIndexedDbAvailable()) {
      return Array.from(this.memChoreos.values());
    }
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('choreographies', 'readonly');
        const store = tx.objectStore('choreographies');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return Array.from(this.memChoreos.values());
    }
  }

  public async saveChoreography(choreo: CoachChoreography): Promise<void> {
    this.memChoreos.set(choreo.id, choreo);

    if (this.isIndexedDbAvailable()) {
      const db = await this.initDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('choreographies', 'readwrite');
        const store = tx.objectStore('choreographies');
        const req = store.put(choreo);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }

  public async deleteChoreography(id: string): Promise<void> {
    const choreo = await this.getChoreographyById(id);
    if (choreo && choreo.versions) {
      for (const v of choreo.versions) {
        if (v.coreoBlobId) {
          await this.deleteBinaryFile(v.coreoBlobId);
        }
      }
    }

    this.memChoreos.delete(id);

    if (this.isIndexedDbAvailable()) {
      const db = await this.initDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('choreographies', 'readwrite');
        const store = tx.objectStore('choreographies');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }

  // ── ARCHIVOS BINARIOS (.coreo, Media) ─────────────────────

  public async saveBinaryFile(fileRecord: StoredBinaryFile): Promise<void> {
    this.memFiles.set(fileRecord.id, fileRecord);

    if (this.isIndexedDbAvailable()) {
      const db = await this.initDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        const store = tx.objectStore('files');
        const req = store.put(fileRecord);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }

  public async getBinaryFile(id: string): Promise<StoredBinaryFile | null> {
    if (!this.isIndexedDbAvailable()) {
      return this.memFiles.get(id) || null;
    }
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readonly');
        const store = tx.objectStore('files');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.memFiles.get(id) || null;
    }
  }

  public async deleteBinaryFile(id: string): Promise<void> {
    this.memFiles.delete(id);
    if (this.isIndexedDbAvailable()) {
      const db = await this.initDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        const store = tx.objectStore('files');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }

  public async getAllFiles(): Promise<StoredBinaryFile[]> {
    if (!this.isIndexedDbAvailable()) {
      return Array.from(this.memFiles.values());
    }
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readonly');
        const store = tx.objectStore('files');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return Array.from(this.memFiles.values());
    }
  }

  // ── EVALUACIONES TÉCNICAS (PANEL TÉCNICO) ─────────────────

  public async saveEvaluation(evaluation: CoachEvaluation): Promise<void> {
    this.memEvaluations.set(evaluation.id, evaluation);

    if (this.isIndexedDbAvailable()) {
      const db = await this.initDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('evaluations', 'readwrite');
        const store = tx.objectStore('evaluations');
        const req = store.put(evaluation);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }

  public async getEvaluationById(id: string): Promise<CoachEvaluation | null> {
    if (!this.isIndexedDbAvailable()) {
      return this.memEvaluations.get(id) || null;
    }
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('evaluations', 'readonly');
        const store = tx.objectStore('evaluations');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.memEvaluations.get(id) || null;
    }
  }

  public async getEvaluationsByAthlete(athleteId: string): Promise<CoachEvaluation[]> {
    if (!this.isIndexedDbAvailable()) {
      return Array.from(this.memEvaluations.values())
        .filter((e) => e.athleteId === athleteId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('evaluations', 'readonly');
        const store = tx.objectStore('evaluations');
        const index = store.index('athleteId');
        const req = index.getAll(athleteId);
        req.onsuccess = () => {
          const list: CoachEvaluation[] = req.result || [];
          list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return Array.from(this.memEvaluations.values())
        .filter((e) => e.athleteId === athleteId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
  }

  public async getAllEvaluations(): Promise<CoachEvaluation[]> {
    if (!this.isIndexedDbAvailable()) {
      return Array.from(this.memEvaluations.values())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    try {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('evaluations', 'readonly');
        const store = tx.objectStore('evaluations');
        const req = store.getAll();
        req.onsuccess = () => {
          const list: CoachEvaluation[] = req.result || [];
          list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return Array.from(this.memEvaluations.values())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
  }

  public async deleteEvaluation(id: string): Promise<void> {
    this.memEvaluations.delete(id);
    if (this.isIndexedDbAvailable()) {
      const db = await this.initDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('evaluations', 'readwrite');
        const store = tx.objectStore('evaluations');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }

  // ── PERFIL ENTRENADOR ─────────────────────────────────────

  public async getProfile(trainerId: string = 'default_trainer'): Promise<CoachProfile> {
    if (this.memProfile) return this.memProfile;

    let profile: CoachProfile | null = null;
    if (this.isIndexedDbAvailable()) {
      try {
        const db = await this.initDB();
        profile = await new Promise((resolve, reject) => {
          const tx = db.transaction('profile', 'readonly');
          const store = tx.objectStore('profile');
          const req = store.get(trainerId);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        });
      } catch {}
    }

    if (!profile) {
      profile = {
        trainerId,
        name: 'Entrenador SkateCoreo',
        email: '',
        club: '',
        connectedStorage: 'local',
        storageConfig: {},
        autoSync: true,
      };
    }
    this.memProfile = profile;
    return profile;
  }

  public async saveProfile(profile: CoachProfile): Promise<void> {
    this.memProfile = profile;
    if (this.isIndexedDbAvailable()) {
      const db = await this.initDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('profile', 'readwrite');
        const store = tx.objectStore('profile');
        const req = store.put(profile);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }

  // ── MIGRACIÓN / SINCRONIZACIÓN CON SKATERS EXISTENTES ─────
  public async syncFromExistingSkaters(): Promise<number> {
    try {
      const existingSkaters = await dbService.getAllSkaters();
      const currentAthletes = await this.getAllAthletes();
      const existingIds = new Set(currentAthletes.map((a) => a.id));

      let imported = 0;
      for (const skater of existingSkaters) {
        if (!existingIds.has(skater.id)) {
          const parts = skater.name.trim().split(' ');
          const firstName = parts[0] || 'Atleta';
          const lastName = parts.slice(1).join(' ') || '';
          const age = skater.age || 12;
          const birthYear = new Date().getFullYear() - age;
          const birthDate = `${birthYear}-01-01`;

          const athlete: CoachAthlete = {
            id: skater.id,
            firstName,
            lastName,
            name: skater.name,
            birthDate,
            age,
            category: (skater.category as any) || 'ESPOIR',
            categoryAuto: true,
            club: skater.club,
            eficiencia: skater.eficiencia,
            created_at: skater.created_at || Date.now(),
            updated_at: Date.now(),
            syncState: 'local',
          };
          await this.saveAthlete(athlete);
          imported++;
        }
      }
      return imported;
    } catch {
      return 0;
    }
  }
}

export const coachDb = new CoachDatabaseService();
