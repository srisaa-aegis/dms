import { ChangeDetectionStrategy, Component, computed, effect, input, model, output, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { formatSize } from '../../core';

/**
 * Choose (or drop) one or more files and hand the `File[]` to the host. Nothing is sent anywhere by the dialog itself.
 * Uses a plain file input so the host needs no extra providers (no HttpClient).
 */
@Component({
  selector: 'dms-upload-dialog',
  standalone: true,
  imports: [DialogModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog [header]="title()" [(visible)]="visible" [modal]="true" [style]="{ width: '520px' }">
      <div
        class="border-2 border-dashed rounded-lg p-6 text-center transition-colors"
        [class]="dragging() ? 'border-blue-500 bg-blue-50' : 'border-gray-300'"
        (dragover)="onDragOver($event)"
        (dragleave)="dragging.set(false)"
        (drop)="onDrop($event)"
      >
        <i class="pi pi-cloud-upload text-3xl opacity-50"></i>
        <p class="text-sm mt-2 mb-3 opacity-70">Drop files here, or</p>
        <label class="cursor-pointer inline-block">
          <span class="px-3 py-2 rounded-md border border-gray-300 text-sm font-medium hover:bg-gray-50">Choose files</span>
          <input type="file" multiple class="hidden" (change)="onPick($event)" />
        </label>
      </div>

      @if (picked().length > 0) {
        <ul class="mt-3 text-sm divide-y divide-gray-100 max-h-48 overflow-auto">
          @for (f of picked(); track $index) {
            <li class="flex items-center justify-between py-1.5 gap-3">
              <span class="truncate">{{ f.name }}</span>
              <span [class]="f.size > maxFileSize() ? 'text-red-600' : 'opacity-60'" class="whitespace-nowrap">
                {{ size(f.size) }}{{ f.size > maxFileSize() ? ' (too large)' : '' }}
              </span>
            </li>
          }
        </ul>
      }

      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="visible.set(false)" />
        <p-button label="Upload" icon="pi pi-upload" [disabled]="valid().length === 0" (onClick)="upload()" />
      </ng-template>
    </p-dialog>
  `,
})
export class UploadDialogComponent {
  readonly visible = model<boolean>(false);
  readonly title = input<string>('Upload files');
  /** Bytes. Larger files are listed as "too large" and skipped. */
  readonly maxFileSize = input<number>(25_000_000);
  readonly uploaded = output<File[]>();

  protected readonly picked = signal<File[]>([]);
  protected readonly dragging = signal(false);
  protected readonly valid = computed(() => this.picked().filter((f) => f.size <= this.maxFileSize()));
  protected readonly size = formatSize;

  constructor() {
    effect(() => {
      if (this.visible()) {
        this.picked.set([]);
        this.dragging.set(false);
      }
    });
  }

  protected onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.picked.set(Array.from(input.files ?? []));
    input.value = ''; // lets the same file be chosen again later
  }

  protected onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    this.picked.set(Array.from(e.dataTransfer?.files ?? []));
  }

  protected upload(): void {
    const files = this.valid();
    if (files.length > 0) this.uploaded.emit(files);
  }
}
