import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  initializeApp,
  cert,
  getApps,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getStorage, type Storage } from 'firebase-admin/storage';
import type { Readable } from 'stream';

export interface FileMetadata {
  path: string;
  size: number;
  mimeType: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private firebaseStorage!: Storage;
  private readonly bucketName = process.env.FIREBASE_STORAGE_BUCKET ?? '';

  onModuleInit() {
    if (!this.bucketName) {
      throw new Error(
        'FIREBASE_STORAGE_BUCKET is required for storage service',
      );
    }

    if (getApps().length === 0) {
      initializeApp({
        credential: cert(this.getServiceAccount()),
        storageBucket: this.bucketName,
      });
    }

    this.firebaseStorage = getStorage();
  }

  private normalizePrivateKey(key: string): string {
    const normalized = key.replace(/\\r\\n|\\n|\\r/g, '\n').trim();

    if (
      !/^-----BEGIN [A-Z ]*PRIVATE KEY-----\n[\s\S]+\n-----END [A-Z ]*PRIVATE KEY-----$/.test(
        normalized,
      )
    ) {
      throw new Error('Firebase private key is invalid');
    }

    return normalized;
  }

  private getServiceAccount(): ServiceAccount {
    const serviceAccountJSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (serviceAccountJSON) {
      const parsed = JSON.parse(serviceAccountJSON) as ServiceAccount &
        Record<string, unknown>;
      const key = parsed.privateKey ?? (parsed.private_key as string);
      if (key) {
        const normalized = this.normalizePrivateKey(key);
        if (parsed.privateKey) parsed.privateKey = normalized;
        else parsed.private_key = normalized;
      }
      return parsed;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
    const privateKey = rawPrivateKey
      ? this.normalizePrivateKey(rawPrivateKey)
      : undefined;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Firebase credentials missing. Provide FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY',
      );
    }

    return {
      projectId,
      clientEmail,
      privateKey,
    };
  }

  private getBucket() {
    return this.firebaseStorage.bucket(this.bucketName);
  }

  protected getObjectPath(id: string, folder: string, ext: string): string {
    return `${folder}/${id}${ext}`;
  }

  async upload(
    id: string,
    data: Buffer | string,
    mimeType = 'application/octet-stream',
    options: {
      folder: string;
      ext: string;
      metadata?: Record<string, string>;
    },
  ): Promise<void> {
    const objectPath = this.getObjectPath(id, options.folder, options.ext);
    const buffer =
      typeof data === 'string' ? Buffer.from(data, 'base64') : data;

    await this.getBucket()
      .file(objectPath)
      .save(buffer, {
        contentType: mimeType,
        resumable: false,
        metadata: {
          contentType: mimeType,
          ...(options.metadata ?? {}),
        },
      });
  }

  async getFile(
    id: string,
    options: {
      folder: string;
      ext: string;
    },
  ): Promise<FileMetadata | null> {
    const objectPath = this.getObjectPath(id, options.folder, options.ext);
    const file = this.getBucket().file(objectPath);
    const [exists] = await file.exists();

    if (!exists) {
      return null;
    }

    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType ?? 'application/octet-stream';
    const size = Number(metadata.size ?? 0);

    return {
      path: objectPath,
      size,
      mimeType: contentType,
    };
  }

  readStream(
    id: string,
    options: {
      folder: string;
      ext: string;
      range?: { start: number; end: number };
    },
  ): Readable {
    const objectPath = this.getObjectPath(id, options.folder, options.ext);
    return this.getBucket().file(objectPath).createReadStream(options.range);
  }
}
