import { StorageProvider, StorageUploadResult } from './StorageProvider';
import { CloudProviderId, StorageItem } from '../../types';
import { coachDb } from '../coachDb';

export class LocalStorageProvider implements StorageProvider {
  readonly id: CloudProviderId = 'local';
  readonly name = 'Almacenamiento Local (IndexedDB / OPFS)';
  readonly iconName = 'HardDrive';

  isConnected(): boolean {
    return true; // Local siempre está conectado
  }

  async connect(): Promise<boolean> {
    return true;
  }

  async disconnect(): Promise<void> {
    // No-op para local
  }

  async getUserInfo(): Promise<{ email?: string; name?: string } | null> {
    const profile = await coachDb.getProfile();
    return {
      email: profile.email || 'Local Offline',
      name: profile.name || 'Entrenador Local',
    };
  }

  async createFolder(folderName: string, parentFolderId?: string): Promise<string> {
    return `local_folder_${folderName}_${parentFolderId || 'root'}`;
  }

  async uploadFile(
    fileName: string,
    content: Blob | string,
    mimeType: string = 'application/octet-stream',
    parentFolderId?: string
  ): Promise<StorageUploadResult> {
    const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
    const fileId = `local_file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await coachDb.saveBinaryFile({
      id: fileId,
      name: fileName,
      mimeType,
      blob,
      size: blob.size,
      savedAt: Date.now(),
      athleteId: parentFolderId,
    });

    return {
      id: fileId,
      name: fileName,
      size: blob.size,
    };
  }

  async downloadFile(fileId: string): Promise<Blob> {
    const record = await coachDb.getBinaryFile(fileId);
    if (!record) {
      throw new Error(`Archivo local no encontrado: ${fileId}`);
    }
    return record.blob;
  }

  async deleteFile(fileId: string): Promise<void> {
    await coachDb.deleteBinaryFile(fileId);
  }

  async listFiles(parentFolderId?: string): Promise<StorageItem[]> {
    const allFiles = await coachDb.getAllFiles();
    const filtered = parentFolderId
      ? allFiles.filter((f) => f.athleteId === parentFolderId)
      : allFiles;

    return filtered.map((f) => ({
      id: f.id,
      name: f.name,
      path: `local://${f.athleteId || 'general'}/${f.name}`,
      isFolder: false,
      size: f.size,
      updatedAt: f.savedAt,
      mimeType: f.mimeType,
    }));
  }

  getOpenLocationUrl(): string | null {
    return null; // Local no tiene URL externa
  }
}
