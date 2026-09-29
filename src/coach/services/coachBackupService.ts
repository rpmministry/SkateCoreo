/**
 * coachBackupService.ts — Servicio Integral de Copias de Seguridad y Restauración
 *
 * Genera y restaura paquetes portables ZIP con:
 *  - manifest.json y trainer.json
 *  - Estructura Athletes/ con athlete.json, Coreografias/*.coreo y Media/avatar
 *  - Cero dependencias de Supabase Storage.
 *
 * Utiliza JSZip (ya instalado en el proyecto).
 */

import JSZip from 'jszip';
import { coachDb } from './coachDb';
import { storageManager } from './storage/StorageManager';
import { CoachAthlete, CoachChoreography } from '../types';

export interface BackupResult {
  blob: Blob;
  fileName: string;
  sizeBytes: number;
  athletesCount: number;
  choreosCount: number;
  filesCount: number;
}

export interface RestoreResult {
  success: boolean;
  athletesRestored: number;
  choreosRestored: number;
  filesRestored: number;
  message: string;
}

export const coachBackupService = {
  /**
   * Genera un paquete de respaldo completo (.zip)
   */
  async createFullBackup(): Promise<BackupResult> {
    const zip = new JSZip();
    const athletes = await coachDb.getAllAthletes();
    const allChoreos = await coachDb.getAllChoreographies();
    const profile = await coachDb.getProfile();

    const rootFolder = zip.folder('SkateCoreo_Backup');
    if (!rootFolder) throw new Error('No se pudo inicializar el paquete ZIP.');

    // 1. trainer.json
    rootFolder.file('trainer.json', JSON.stringify(profile, null, 2));

    // 2. Carpeta Athletes/
    const athletesFolder = rootFolder.folder('Athletes');
    let totalFilesPacked = 0;

    for (const athlete of athletes) {
      const safeDirName = `${athlete.name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim()}_${athlete.id.slice(-6)}`;
      const athleteDir = athletesFolder?.folder(safeDirName);
      if (!athleteDir) continue;

      // athlete.json
      athleteDir.file('athlete.json', JSON.stringify(athlete, null, 2));

      // Media (Avatar)
      if (athlete.photoDataUrl) {
        try {
          const res = await fetch(athlete.photoDataUrl);
          const photoBlob = await res.blob();
          const photoBytes = await photoBlob.arrayBuffer();
          athleteDir.folder('Media')?.file('avatar.jpg', photoBytes);
          totalFilesPacked++;
        } catch {}
      }

      // Coreografías del atleta
      const athleteChoreos = allChoreos.filter((c) => c.athleteId === athlete.id);
      const choreosDir = athleteDir.folder('Coreografias');

      for (const ch of athleteChoreos) {
        // Guardar metadata de la coreografía
        choreosDir?.file(`${ch.id}_meta.json`, JSON.stringify(ch, null, 2));

        for (const v of ch.versions) {
          if (v.coreoBlobId) {
            const binary = await coachDb.getBinaryFile(v.coreoBlobId);
            if (binary && binary.blob) {
              const fileBytes = await binary.blob.arrayBuffer();
              choreosDir?.file(v.fileName, fileBytes);
              totalFilesPacked++;
            }
          }
        }
      }
    }

    // 3. manifest.json
    const manifest = {
      version: '1.0.0',
      system: 'SkateCoreo Coach Portal',
      exportedAt: Date.now(),
      trainer: {
        id: profile.trainerId,
        name: profile.name,
        email: profile.email,
        club: profile.club,
      },
      summary: {
        athletesCount: athletes.length,
        choreographiesCount: allChoreos.length,
        filesCount: totalFilesPacked,
      },
    };
    rootFolder.file('manifest.json', JSON.stringify(manifest, null, 2));

    // Generar archivo binario ZIP comprimido
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `SkateCoreo_Backup_${dateStr}.zip`;

    // Actualizar fecha de último backup en el perfil
    profile.lastBackupDate = Date.now();
    await coachDb.saveProfile(profile);

    return {
      blob: zipBlob,
      fileName,
      sizeBytes: zipBlob.size,
      athletesCount: athletes.length,
      choreosCount: allChoreos.length,
      filesCount: totalFilesPacked,
    };
  },

  /**
   * Descarga el backup en el navegador/dispositivo.
   */
  async exportBackupToDisk(): Promise<BackupResult> {
    const backup = await this.createFullBackup();
    const url = URL.createObjectURL(backup.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backup.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return backup;
  },

  /**
   * Guarda el backup directamente en la nube conectada del entrenador (Google Drive, OneDrive o Dropbox).
   */
  async saveBackupToCloud(): Promise<{ success: boolean; message: string }> {
    const provider = storageManager.getActiveProvider();
    if (provider.id === 'local') {
      return { success: false, message: 'Primero conecta Google Drive, OneDrive o Dropbox en Ajustes.' };
    }

    const backup = await this.createFullBackup();
    const { coachFolderId } = await storageManager.ensureBaseStructure();
    const backupsFolderId = await provider.createFolder('Backups', coachFolderId);

    await provider.uploadFile(
      backup.fileName,
      backup.blob,
      'application/zip',
      backupsFolderId
    );

    return {
      success: true,
      message: `Copia de seguridad guardada con éxito en ${provider.name} (${(backup.sizeBytes / 1024).toFixed(0)} KB).`,
    };
  },

  /**
   * Restaura un respaldo completo desde un archivo ZIP.
   */
  async restoreBackup(file: File | Blob): Promise<RestoreResult> {
    const zip = await JSZip.loadAsync(file);

    // Buscar manifest.json (en raíz o dentro de SkateCoreo_Backup/)
    let manifestFile = zip.file('manifest.json') || zip.file('SkateCoreo_Backup/manifest.json');
    if (!manifestFile) {
      // Buscar recursivamente
      const found = zip.file(/manifest\.json$/);
      if (found.length > 0) manifestFile = found[0];
    }

    if (!manifestFile) {
      throw new Error('Archivo de copia de seguridad inválido: no contiene manifest.json');
    }

    const manifestText = await manifestFile.async('string');
    JSON.parse(manifestText);

    let athletesRestored = 0;
    let choreosRestored = 0;
    let filesRestored = 0;

    // 1. Restaurar perfil si existe trainer.json
    const trainerFile = zip.file('trainer.json') || zip.file('SkateCoreo_Backup/trainer.json');
    if (trainerFile) {
      try {
        const trainerText = await trainerFile.async('string');
        const trainerData = JSON.parse(trainerText);
        await coachDb.saveProfile(trainerData);
      } catch {}
    }

    // 2. Localizar todos los athlete.json
    const athleteFiles = zip.file(/Athletes\/[^/]+\/athlete\.json$/);
    for (const af of athleteFiles) {
      try {
        const aText = await af.async('string');
        const athlete: CoachAthlete = JSON.parse(aText);
        await coachDb.saveAthlete(athlete);
        athletesRestored++;

        // Directorio base del atleta
        const athleteDirPath = af.name.replace('/athlete.json', '');

        // Restaurar avatar si existe
        const avatarFile = zip.file(`${athleteDirPath}/Media/avatar.jpg`);
        if (avatarFile) {
          const avatarBytes = await avatarFile.async('arraybuffer');
          const blob = new Blob([avatarBytes], { type: 'image/jpeg' });
          const fileId = `avatar_${athlete.id}`;
          await coachDb.saveBinaryFile({
            id: fileId,
            name: 'avatar.jpg',
            mimeType: 'image/jpeg',
            blob,
            size: blob.size,
            savedAt: Date.now(),
            athleteId: athlete.id,
          });
          athlete.photoDataUrl = URL.createObjectURL(blob);
          await coachDb.saveAthlete(athlete);
          filesRestored++;
        }

        // Restaurar coreografías del atleta
        const metaFiles = zip.file(new RegExp(`^${athleteDirPath}/Coreografias/[^/]+_meta\\.json$`));
        for (const mf of metaFiles) {
          try {
            const metaText = await mf.async('string');
            const choreo: CoachChoreography = JSON.parse(metaText);

            // Restaurar archivos .coreo para cada versión
            for (const v of choreo.versions) {
              const coreoFile = zip.file(`${athleteDirPath}/Coreografias/${v.fileName}`);
              if (coreoFile) {
                const coreoBytes = await coreoFile.async('arraybuffer');
                const blob = new Blob([coreoBytes], { type: 'application/octet-stream' });
                const blobId = `coreo_${choreo.id}_v${v.versionNumber}_${Date.now()}`;
                await coachDb.saveBinaryFile({
                  id: blobId,
                  name: v.fileName,
                  mimeType: 'application/octet-stream',
                  blob,
                  size: blob.size,
                  savedAt: v.savedAt || Date.now(),
                  athleteId: athlete.id,
                  choreographyId: choreo.id,
                  versionNumber: v.versionNumber,
                });
                v.coreoBlobId = blobId;
                v.coreoBlobSize = blob.size;
                filesRestored++;
              }
            }

            await coachDb.saveChoreography(choreo);
            choreosRestored++;
          } catch {}
        }
      } catch (err: any) {
        console.warn('Error restaurando atleta individual:', err);
      }
    }

    return {
      success: true,
      athletesRestored,
      choreosRestored,
      filesRestored,
      message: `Copia restaurada: ${athletesRestored} atletas, ${choreosRestored} coreografías y ${filesRestored} archivos recuperados con éxito.`,
    };
  },
};
