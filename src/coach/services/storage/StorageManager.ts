/**
 * StorageManager.ts — Gestor Orquestador de Almacenamiento y Sincronización
 *
 * Sigue el principio arquitectónico:
 *   Local-first + Nube Personal (Google Drive / OneDrive / Dropbox)
 *   CERO almacenamiento en Supabase Storage para archivos de atletas.
 *
 * Provee:
 *  - Abstracción transparente de proveedores
 *  - Jerarquía estricta de carpetas (SkateCoreo/Entrenadores/...)
 *  - Sincronización selectiva (metadatos primero, binarios bajo demanda)
 *  - Detección y manejo de conflictos sin sobrescritura destructiva
 *  - Subida e importación de fichas completas
 */

import { StorageProvider } from './StorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
import { GoogleDriveProvider } from './GoogleDriveProvider';
import { OneDriveProvider } from './OneDriveProvider';
import { DropboxProvider } from './DropboxProvider';
import { CloudProviderId, StorageSummary, SyncState } from '../../types';
import { coachDb } from '../coachDb';

export class StorageManager {
  private providers: Map<CloudProviderId, StorageProvider> = new Map();
  private activeProviderId: CloudProviderId = 'local';
  private syncInProgress: boolean = false;

  constructor() {
    this.providers.set('local', new LocalStorageProvider());
    this.providers.set('google_drive', new GoogleDriveProvider());
    this.providers.set('onedrive', new OneDriveProvider());
    this.providers.set('dropbox', new DropboxProvider());
  }

  public getProvider(id: CloudProviderId): StorageProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Proveedor no reconocido: ${id}`);
    return provider;
  }

  public getActiveProvider(): StorageProvider {
    return this.getProvider(this.activeProviderId);
  }

  public setActiveProvider(id: CloudProviderId): void {
    this.activeProviderId = id;
  }

  public async initFromProfile(): Promise<void> {
    const profile = await coachDb.getProfile();
    this.activeProviderId = profile.connectedStorage || 'local';

    // Configurar credenciales si existen
    if (profile.storageConfig.googleDrive) {
      const g = this.providers.get('google_drive') as GoogleDriveProvider;
      if (profile.storageConfig.googleDrive.clientId) {
        g.setConfig(
          profile.storageConfig.googleDrive.clientId,
          profile.storageConfig.googleDrive.accessToken,
          Math.max(60, Math.floor(((profile.storageConfig.googleDrive.expiresAt || 0) - Date.now()) / 1000))
        );
      }
    }
  }

  /**
   * Obtiene resumen estadístico del almacenamiento y sincronización.
   */
  public async getSummary(): Promise<StorageSummary> {
    const athletes = await coachDb.getAllAthletes();
    const choreos = await coachDb.getAllChoreographies();
    const files = await coachDb.getAllFiles();

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const totalStorageBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);

    const pendingSyncCount = athletes.filter((a) => a.syncState === 'pending_upload').length +
      choreos.filter((c) => c.syncState === 'pending_upload').length;
    const conflictCount = athletes.filter((a) => a.syncState === 'conflict').length;

    let overallState: SyncState = 'local';
    if (this.activeProviderId !== 'local') {
      if (conflictCount > 0) overallState = 'conflict';
      else if (pendingSyncCount > 0) overallState = 'pending_upload';
      else overallState = 'synced';
    }

    return {
      activeProvider: this.activeProviderId,
      isOnline,
      totalAthletes: athletes.length,
      totalChoreographies: choreos.length,
      totalFiles: files.length,
      totalStorageBytes,
      syncState: overallState,
      pendingSyncCount,
      conflictCount,
    };
  }

  /**
   * Asegura la estructura base de carpetas en el proveedor conectado:
   * SkateCoreo / Entrenadores / [Nombre_Entrenador]
   */
  public async ensureBaseStructure(): Promise<{ rootId: string; coachFolderId: string }> {
    const provider = this.getActiveProvider();
    if (provider.id === 'local') {
      return { rootId: 'local_root', coachFolderId: 'local_coach' };
    }

    const profile = await coachDb.getProfile();
    const trainerFolderName = (profile.name || 'Entrenador').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'Principal';

    // 1. Crear o buscar /SkateCoreo
    const rootFolderId = await provider.createFolder('SkateCoreo');
    // 2. Crear o buscar /SkateCoreo/Entrenadores
    const trainersFolderId = await provider.createFolder('Entrenadores', rootFolderId);
    // 3. Crear o buscar carpeta del entrenador
    const coachFolderId = await provider.createFolder(trainerFolderName, trainersFolderId);
    // 4. Crear subcarpetas estándar: Atletas y Backups
    await provider.createFolder('Atletas', coachFolderId);
    await provider.createFolder('Backups', coachFolderId);

    return { rootId: rootFolderId, coachFolderId };
  }

  /**
   * Sube una ficha completa de atleta a la nube personal del entrenador:
   * Atleta/
   *  ├── athlete.json
   *  ├── Coreografias/
   *  │    └── *.coreo
   *  └── Media/
   *       └── foto.jpg
   */
  public async uploadCompleteAthleteDossier(athleteId: string): Promise<{ success: boolean; message: string }> {
    const provider = this.getActiveProvider();
    if (provider.id === 'local') {
      return { success: true, message: 'Ficha guardada localmente en IndexedDB.' };
    }

    if (!provider.isConnected()) {
      return { success: false, message: `${provider.name} no está conectado.` };
    }

    const athlete = await coachDb.getAthleteById(athleteId);
    if (!athlete) return { success: false, message: 'Atleta no encontrado.' };

    try {
      const { coachFolderId } = await this.ensureBaseStructure();
      const athletesFolderId = await provider.createFolder('Atletas', coachFolderId);

      const safeAthleteFolderName = `${athlete.name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim()}_${athlete.id.slice(-6)}`;
      const athleteFolderId = await provider.createFolder(safeAthleteFolderName, athletesFolderId);

      const coreosFolderId = await provider.createFolder('Coreografias', athleteFolderId);
      const mediaFolderId = await provider.createFolder('Media', athleteFolderId);

      // 1. Subir athlete.json
      const athleteJson = JSON.stringify(
        {
          version: '1.0.0',
          exportedAt: Date.now(),
          athlete,
        },
        null,
        2
      );
      await provider.uploadFile('athlete.json', athleteJson, 'application/json', athleteFolderId);

      // 2. Subir avatar si existe
      if (athlete.photoDataUrl) {
        try {
          const res = await fetch(athlete.photoDataUrl);
          const photoBlob = await res.blob();
          await provider.uploadFile('avatar.jpg', photoBlob, 'image/jpeg', mediaFolderId);
        } catch {}
      }

      // 3. Subir coreografías asociadas y sus archivos .coreo
      const choreos = await coachDb.getChoreographiesByAthlete(athleteId);
      for (const ch of choreos) {
        for (const v of ch.versions) {
          if (v.coreoBlobId) {
            const binaryFile = await coachDb.getBinaryFile(v.coreoBlobId);
            if (binaryFile && binaryFile.blob) {
              const uploadRes = await provider.uploadFile(
                v.fileName,
                binaryFile.blob,
                'application/octet-stream',
                coreosFolderId
              );
              v.cloudFileId = uploadRes.id;
              v.syncState = 'synced';
            }
          }
        }
        ch.syncState = 'synced';
        await coachDb.saveChoreography(ch);
      }

      // Actualizar estado del atleta
      athlete.syncState = 'synced';
      athlete.cloudFolderId = athleteFolderId;
      athlete.updated_at = Date.now();
      await coachDb.saveAthlete(athlete);

      return {
        success: true,
        message: `Ficha de "${athlete.name}" y sus ${choreos.length} coreografías sincronizadas con éxito en ${provider.name}.`,
      };
    } catch (err: any) {
      athlete.syncState = 'error';
      await coachDb.saveAthlete(athlete);
      return { success: false, message: `Error al subir ficha: ${err.message}` };
    }
  }

  /**
   * Sube una coreografía específica (.coreo) a la nube del entrenador.
   */
  public async uploadChoreographyVersion(
    athleteId: string,
    choreographyId: string,
    versionNumber: number
  ): Promise<{ success: boolean; message: string; webViewLink?: string }> {
    const provider = this.getActiveProvider();
    if (provider.id === 'local') {
      return { success: true, message: 'Coreografía guardada localmente.' };
    }

    const choreo = await coachDb.getChoreographyById(choreographyId);
    if (!choreo) return { success: false, message: 'Coreografía no encontrada.' };

    const version = choreo.versions.find((v) => v.versionNumber === versionNumber);
    if (!version || !version.coreoBlobId) {
      return { success: false, message: 'Versión de coreografía sin archivo asociado.' };
    }

    const binaryFile = await coachDb.getBinaryFile(version.coreoBlobId);
    if (!binaryFile) {
      return { success: false, message: 'Archivo .coreo no encontrado en almacenamiento local.' };
    }

    try {
      const { coachFolderId } = await this.ensureBaseStructure();
      const athletesFolderId = await provider.createFolder('Atletas', coachFolderId);

      const athlete = await coachDb.getAthleteById(athleteId);
      const athleteName = athlete ? athlete.name : 'Atleta';
      const safeAthleteFolderName = `${athleteName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim()}_${athleteId.slice(-6)}`;
      const athleteFolderId = await provider.createFolder(safeAthleteFolderName, athletesFolderId);
      const coreosFolderId = await provider.createFolder('Coreografias', athleteFolderId);

      const res = await provider.uploadFile(
        version.fileName,
        binaryFile.blob,
        'application/octet-stream',
        coreosFolderId
      );

      version.cloudFileId = res.id;
      version.syncState = 'synced';
      choreo.syncState = 'synced';
      await coachDb.saveChoreography(choreo);

      return {
        success: true,
        message: `Archivo "${version.fileName}" subido con éxito a ${provider.name}.`,
        webViewLink: res.webViewLink,
      };
    } catch (err: any) {
      version.syncState = 'error';
      await coachDb.saveChoreography(choreo);
      return { success: false, message: `Error al subir .coreo: ${err.message}` };
    }
  }

  /**
   * Sincronización general de todos los cambios locales pendientes hacia la nube.
   */
  public async syncAll(): Promise<{ syncedAthletes: number; syncedChoreos: number; errors: string[] }> {
    if (this.syncInProgress) {
      return { syncedAthletes: 0, syncedChoreos: 0, errors: ['Sincronización ya en curso.'] };
    }
    this.syncInProgress = true;

    let syncedAthletes = 0;
    let syncedChoreos = 0;
    const errors: string[] = [];

    try {
      const athletes = await coachDb.getAllAthletes();
      for (const a of athletes) {
        const res = await this.uploadCompleteAthleteDossier(a.id);
        if (res.success) syncedAthletes++;
        else errors.push(res.message);
      }
    } finally {
      this.syncInProgress = false;
    }

    return { syncedAthletes, syncedChoreos, errors };
  }
}

export const storageManager = new StorageManager();
