export type JobStatus = 'new' | 'in_progress' | 'done';
export type SyncState = 'synced' | 'pending' | 'conflict' | 'error';

export interface ServerReport {
  note: string; lat: number | null; lng: number | null; locationAccuracy: number | null; deviceCode: string | null;
  recipientFullName: string; signatureSvg: string | null; photoIds: string[];
  createdAt: string; completedAt: string | null; updatedAt: string;
}
export interface ServerJob {
  id: string; title: string; customer: string; address: string; scheduledAt: string;
  status: JobStatus; version: number; updatedAt: string; report: ServerReport | null;
}

export interface Job {
  id: string; title: string; customer: string; address: string; scheduledAt: string;
  status: JobStatus; version: number; syncState: SyncState; syncError: string | null;
  conflict: ServerJob | null; hasReport: boolean;
}
export interface Report {
  jobId: string; note: string; recipientFullName: string; lat: number | null; lng: number | null;
  locationAccuracy: number | null;
  deviceCode: string | null; signatureSvg: string | null; submitted: boolean;
  createdAt: string | null; completedAt: string | null;
}
export interface Photo { id: string; jobId: string; fileName: string; uploaded: boolean; createdAt: string }

export type MutationKind = 'photo' | 'photo_delete' | 'status' | 'report';
export interface OutboxRow { seq: number; id: string; jobId: string; kind: MutationKind; payload: any }
