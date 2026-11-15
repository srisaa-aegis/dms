import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { folderPath, isViewable, toDmsError, type DmsFile, type DmsFolder, type DocumentSource } from '../core';
import { BreadcrumbComponent } from '../components/breadcrumb';
import { FileListComponent } from '../components/file-list';
import { FolderTreeComponent } from '../components/folder-tree';
import { NameDialogComponent } from '../components/name-dialog';
import { UploadDialogComponent } from '../components/upload-dialog';

type NameMode = 'newFolder' | 'renameFolder' | 'renameFile';

/**
 * The document manager: folder tree, breadcrumb and file list with upload, new folder, rename, delete, view and
 * download. It knows nothing about where documents live: hand it any `DocumentSource` (a local folder, Google Drive,
 * your own API) and switch sources at any time by changing the `source` input.
 */
@Component({
  selector: 'dms-document-manager',
  standalone: true,
  imports: [
    ButtonModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    FolderTreeComponent,
    BreadcrumbComponent,
    FileListComponent,
    NameDialogComponent,
    UploadDialogComponent,
  ],
  providers: [MessageService, ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-toast />
    <p-confirmDialog />

    <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
      <h2 class="text-2xl font-bold flex items-center gap-2">
        <i class="pi pi-folder-open text-blue-600"></i> {{ title() }}
        <p-tag [value]="sourceLabel()" severity="secondary" />
        @if (source().readOnly) {
          <p-tag value="read-only" severity="warn" />
        }
      </h2>
      <div class="flex gap-2">
        @if (!source().readOnly) {
          <p-button label="Upload" icon="pi pi-upload" [disabled]="!selectedId()" (onClick)="uploadVisible.set(true)" />
          <p-button label="New Folder" icon="pi pi-plus" [outlined]="true" [disabled]="!selectedId()" (onClick)="openName('newFolder')" />
          <p-button icon="pi pi-pencil" [outlined]="true" [text]="true" title="Rename folder" [disabled]="!canChangeFolder()" (onClick)="openName('renameFolder')" />
          <p-button icon="pi pi-trash" severity="danger" [outlined]="true" [text]="true" title="Delete folder" [disabled]="!canChangeFolder()" (onClick)="deleteFolder()" />
        }
      </div>
    </div>

    <div class="flex gap-4 flex-col md:flex-row">
      <div class="md:w-[340px] flex-shrink-0">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
          <dms-folder-tree [folders]="folders()" [selectedId]="selectedId()" [loading]="loadingFolders()" (select)="selectFolder($event)" />
        </div>
      </div>

      <div class="flex-1 min-w-0">
        <div class="mb-3"><dms-breadcrumb [path]="breadcrumb()" (navigate)="selectFolder($event)" /></div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200">
          @if (!selectedId()) {
            <div class="text-center py-16 opacity-40">
              <i class="pi pi-folder text-5xl mb-4"></i>
              <p>Select a folder to view documents</p>
            </div>
          } @else {
            <dms-file-list
              [files]="files()"
              [loading]="loadingFiles()"
              [readOnly]="source().readOnly"
              [busyId]="busyFileId()"
              (open)="view($event)"
              (download)="download($event)"
              (rename)="openName('renameFile', $event)"
              (remove)="deleteFile($event)"
            />
          }
        </div>
      </div>
    </div>

    <dms-name-dialog
      [(visible)]="nameVisible"
      [title]="nameTitle()"
      [label]="nameMode() === 'renameFile' ? 'File name' : 'Folder name'"
      [confirmLabel]="nameMode() === 'newFolder' ? 'Create' : 'Rename'"
      [initial]="nameInitial()"
      (confirmed)="confirmName($event)"
    />
    <dms-upload-dialog [(visible)]="uploadVisible" [maxFileSize]="maxFileSize()" (uploaded)="upload($event)" />
  `,
})
export class DocumentManagerComponent {
  readonly source = input.required<DocumentSource>();
  readonly title = input<string>('Documents');
  /** Bytes. */
  readonly maxFileSize = input<number>(25_000_000);

  /** Emits a readable message whenever an operation fails (it is also shown as a toast). */
  readonly failed = output<string>();
  /** Emits after any change to folders or files. */
  readonly changed = output<void>();

  protected readonly folders = signal<DmsFolder[]>([]);
  protected readonly files = signal<DmsFile[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly loadingFolders = signal(false);
  protected readonly loadingFiles = signal(false);
  protected readonly busyFileId = signal<string | null>(null);

  protected readonly nameVisible = signal(false);
  protected readonly nameMode = signal<NameMode>('newFolder');
  protected readonly nameInitial = signal('');
  protected readonly uploadVisible = signal(false);
  private renameTarget: DmsFile | null = null;

  protected readonly sourceLabel = computed(() => this.source().label);
  protected readonly breadcrumb = computed(() => {
    const id = this.selectedId();
    return id === null ? [] : folderPath(this.folders(), id);
  });
  protected readonly selectedFolder = computed(() => this.folders().find((f) => f.id === this.selectedId()) ?? null);
  protected readonly canChangeFolder = computed(() => !!this.selectedFolder()?.parentId);
  protected readonly nameTitle = computed(() =>
    this.nameMode() === 'newFolder' ? 'New folder' : this.nameMode() === 'renameFolder' ? 'Rename folder' : 'Rename file',
  );

  constructor(
    private readonly msg: MessageService,
    private readonly confirm: ConfirmationService,
  ) {
    // (Re)load whenever a different source is supplied.
    effect(() => {
      const s = this.source();
      untracked(() => void this.init(s));
    });
  }

  // ----- loading -----

  private async init(s: DocumentSource): Promise<void> {
    this.folders.set([]);
    this.files.set([]);
    this.selectedId.set(null);
    await this.loadFolders(s, null);
  }

  /** Reloads the tree and keeps `keep` selected when it still exists (else the root). */
  private async loadFolders(s: DocumentSource, keep: string | null): Promise<void> {
    this.loadingFolders.set(true);
    try {
      const list = await s.listFolders();
      if (s !== this.source()) return; // the source was swapped while loading
      this.folders.set(list);
      const target = keep !== null && list.some((f) => f.id === keep) ? keep : (list[0]?.id ?? null);
      this.selectedId.set(target);
      if (target !== null) await this.loadFiles(s, target);
      else this.files.set([]);
    } catch (e) {
      this.fail(e, 'Could not load folders');
    } finally {
      this.loadingFolders.set(false);
    }
  }

  private async loadFiles(s: DocumentSource, folderId: string): Promise<void> {
    this.loadingFiles.set(true);
    try {
      const list = await s.listFiles(folderId);
      if (s === this.source() && this.selectedId() === folderId) this.files.set(list);
    } catch (e) {
      this.fail(e, 'Could not load files');
    } finally {
      this.loadingFiles.set(false);
    }
  }

  protected async selectFolder(id: string): Promise<void> {
    this.selectedId.set(id);
    await this.loadFiles(this.source(), id);
  }

  // ----- folder actions -----

  protected openName(mode: NameMode, file?: DmsFile): void {
    this.nameMode.set(mode);
    this.renameTarget = file ?? null;
    this.nameInitial.set(mode === 'renameFile' ? (file?.name ?? '') : mode === 'renameFolder' ? (this.selectedFolder()?.name ?? '') : '');
    this.nameVisible.set(true);
  }

  protected async confirmName(name: string): Promise<void> {
    const s = this.source();
    const mode = this.nameMode();
    const folderId = this.selectedId();
    if (folderId === null) return;
    try {
      if (mode === 'newFolder') {
        const created = await s.createFolder(name, folderId);
        this.ok('Folder created');
        this.nameVisible.set(false);
        await this.loadFolders(s, created.id);
      } else if (mode === 'renameFolder') {
        await s.renameFolder(folderId, name);
        this.ok('Folder renamed');
        this.nameVisible.set(false);
        await this.loadFolders(s, folderId);
      } else if (this.renameTarget) {
        await s.renameFile(this.renameTarget.id, name);
        this.ok('File renamed');
        this.nameVisible.set(false);
        await this.loadFiles(s, folderId);
      }
      this.changed.emit();
    } catch (e) {
      this.fail(e, 'Could not save the name');
    }
  }

  protected deleteFolder(): void {
    const folder = this.selectedFolder();
    if (!folder?.parentId) return;
    const parent = folder.parentId;
    this.confirm.confirm({
      message: `Delete folder "${folder.name}" and everything in it?`,
      accept: async () => {
        const s = this.source();
        try {
          await s.deleteFolder(folder.id);
          this.ok('Folder deleted');
          await this.loadFolders(s, parent);
          this.changed.emit();
        } catch (e) {
          this.fail(e, 'Could not delete the folder');
        }
      },
    });
  }

  // ----- file actions -----

  protected async upload(picked: File[]): Promise<void> {
    const s = this.source();
    const folderId = this.selectedId();
    if (folderId === null) return;
    let done = 0;
    for (const f of picked) {
      try {
        await s.uploadFile(folderId, f);
        done++;
      } catch (e) {
        this.fail(e, `Could not upload ${f.name}`);
      }
    }
    if (done > 0) {
      this.ok(`${done} file(s) uploaded`);
      this.uploadVisible.set(false);
      await this.loadFiles(s, folderId);
      this.changed.emit();
    }
  }

  protected deleteFile(file: DmsFile): void {
    this.confirm.confirm({
      message: `Delete "${file.name}"?`,
      accept: async () => {
        const s = this.source();
        try {
          await s.deleteFile(file.id);
          this.ok('File deleted');
          await this.loadFiles(s, file.folderId);
          this.changed.emit();
        } catch (e) {
          this.fail(e, 'Could not delete the file');
        }
      },
    });
  }

  protected async view(file: DmsFile): Promise<void> {
    if (!isViewable(file.mimeType)) return this.download(file);
    await this.withContent(file, (url) => window.open(url, '_blank', 'noopener'));
  }

  protected async download(file: DmsFile): Promise<void> {
    await this.withContent(file, (url) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName;
      a.click();
    });
  }

  /** Resolves a URL for the file (direct link if the source has one, else a blob URL) and hands it to `use`. */
  private async withContent(file: DmsFile, use: (url: string) => void): Promise<void> {
    const s = this.source();
    const direct = s.getUrl?.(file) ?? null;
    if (direct) return use(direct);
    this.busyFileId.set(file.id);
    try {
      const blob = await s.getBlob(file);
      const url = URL.createObjectURL(new Blob([blob], { type: file.mimeType }));
      use(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      this.fail(e, 'Could not open the file');
    } finally {
      this.busyFileId.set(null);
    }
  }

  // ----- messages -----

  private ok(summary: string): void {
    this.msg.add({ severity: 'success', summary });
  }

  private fail(e: unknown, fallback: string): void {
    const message = toDmsError(e, fallback).message;
    this.msg.add({ severity: 'error', summary: message });
    this.failed.emit(message);
  }
}
